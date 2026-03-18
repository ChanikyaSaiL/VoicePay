import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mic, Camera, CheckCircle2, ShieldAlert, ArrowLeft, Loader2, DollarSign } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as faceapi from 'face-api.js';
import { speak, stopSpeaking, TTS } from '../utils/tts';

export default function PaymentAuth() {
    const { user, login } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Safely extract the state passed from VoiceOverlay
    const { nlpResult, matchedContacts } = location.state || { nlpResult: null, matchedContacts: [] };

    const [authStep, setAuthStep] = useState(1); // 1 = Voice, 2 = Face (Conditional), 3 = Success, 4 = Halted
    const [isVerifying, setIsVerifying] = useState(false);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [error, setError] = useState('');
    const [voiceAttempts, setVoiceAttempts] = useState(0);
    const [faceAttempts, setFaceAttempts] = useState(0);

    // Voice Capture Refs
    const mediaRecorderRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const voiceMimeRef = useRef('audio/webm');

    // Face Capture Refs
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);

    // Hard redirect if accessed directly without transaction intent
    useEffect(() => {
        if (!nlpResult?.amount || !matchedContacts || matchedContacts.length === 0) {
            navigate('/');
            return;
        }

        // Announce the voice step instructions
        speak(TTS.voicePrompt(amount, recipient.name));

        // Load Face API models silently in the background
        const loadModels = async () => {
            try {
                await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
                await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
                await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
                setFaceModelsLoaded(true);
                console.log('[PaymentAuth] FaceAPI models ready');
            } catch (e) {
                console.error('Face models failed to load', e);
            }
        };
        loadModels();

        return () => stopSpeaking();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const recipient = matchedContacts[0] || {};
    const amount = Number(nlpResult?.amount) || 0;

    // High-value transactions require Face ID
    const HIGH_VALUE_THRESHOLD = 1000;
    const requiresFaceVerification = amount >= HIGH_VALUE_THRESHOLD;

    // --- Voice Verification Handlers ---
    const handleStartVoice = async () => {
        try {
            setError('');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Choose MIME type once — must match between recorder and Blob to avoid corruption
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4';
            voiceMimeRef.current = mimeType;

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                setIsVerifying(true);
                stream.getTracks().forEach(track => track.stop());

                const recordedMime = voiceMimeRef.current;
                const ext = recordedMime.includes('mp4') ? 'mp4' : 'webm';
                const audioBlob = new Blob(chunks, { type: recordedMime });

                try {
                    // === STEP 1: Whisper passphrase liveness check ===
                    const transcribeForm = new FormData();
                    transcribeForm.append('audio', audioBlob, `recording.${ext}`);

                    // === STEP 2: Wav2Vec2 real speaker embedding match ===
                    const voiceForm = new FormData();
                    voiceForm.append('audio', audioBlob, `recording.${ext}`);
                    voiceForm.append('email', user.email);

                    const [transcribeRes, voiceRes] = await Promise.all([
                        fetch('http://127.0.0.1:5005/api/speech/transcribe', { method: 'POST', body: transcribeForm }),
                        fetch('http://127.0.0.1:5005/api/voice/verify', { method: 'POST', body: voiceForm })
                    ]);

                    const [transcribeData, voiceData] = await Promise.all([
                        transcribeRes.json(),
                        voiceRes.json()
                    ]);

                    // ── Passphrase strict validation ─────────────────────────────────────
                    // Required phrase: "I confirm payment of ₹{amount} to {recipient.name}"
                    // Whisper may transcribe the number as digits ("500") or words ("five hundred").
                    if (!transcribeRes.ok) throw new Error(transcribeData.message || 'Transcription failed.');

                    const transcript = (transcribeData.transcript || '').toLowerCase().trim();
                    console.log('[PaymentAuth] Whisper transcript:', transcript);

                    // Helper: convert an integer amount to its English word representation
                    // (covers amounts up to 99,999 which covers typical payment amounts)
                    const amountToWords = (n) => {
                        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
                                       'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
                                       'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
                        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty',
                                       'sixty', 'seventy', 'eighty', 'ninety'];
                        if (n < 20) return ones[n];
                        if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
                        if (n < 1000) return `${ones[Math.floor(n / 100)]} hundred${n % 100 ? ' ' + amountToWords(n % 100) : ''}`;
                        if (n < 100000) return `${amountToWords(Math.floor(n / 1000))} thousand${n % 1000 ? ' ' + amountToWords(n % 1000) : ''}`;
                        return String(n);
                    };

                    const amountStr      = String(amount);                       // "500"
                    const amountWords    = amountToWords(amount).toLowerCase();  // "five hundred"
                    const recipientFirst = recipient.name?.split(' ')[0].toLowerCase() || '';

                    const hasConfirm   = transcript.includes('confirm');
                    const hasPayment   = transcript.includes('payment');
                    const hasAmount    = transcript.includes(amountStr) || transcript.includes(amountWords);
                    const hasRecipient = recipientFirst && transcript.includes(recipientFirst);
                    const wordCount    = transcript.split(/\s+/).filter(Boolean).length;
                    const isComplete   = wordCount >= 6; // "I confirm payment of X to Y" = 7 words min

                    const missing = [];
                    if (!hasConfirm)   missing.push('"confirm"');
                    if (!hasPayment)   missing.push('"payment"');
                    if (!hasAmount)    missing.push(`the amount (${amountStr})`);
                    if (!hasRecipient && recipientFirst) missing.push(`the recipient name "${recipient.name}"`);
                    if (!isComplete)   missing.push('the complete sentence');

                    if (missing.length > 0) {
                        throw new Error(
                            `Incomplete passphrase — missing: ${missing.join(', ')}. ` +
                            `Please say the full phrase: "I confirm payment of ₹${amount} to ${recipient.name}". ` +
                            `Heard: "${transcribeData.transcript}"`
                        );
                    }
                    // ─────────────────────────────────────────────────────────────────────


                    // Speaker embedding check
                    if (!voiceRes.ok) {
                        // If no enrollment found, skip speaker check (log warning)
                        console.warn('[PaymentAuth] Speaker verification skipped:', voiceData.message);
                    } else if (!voiceData.isMatch) {
                        throw new Error(`Voiceprint mismatch — ${voiceData.message} Please ensure you are using the same voice as during enrollment.`);
                    } else {
                        console.log(`[PaymentAuth] Voiceprint matched: ${voiceData.similarityScore}% similarity`);
                    }

                    // Both checks passed — proceed
                    if (requiresFaceVerification) {
                        setAuthStep(2);
                    } else {
                        setAuthStep(3);
                    }
                } catch (err) {
                    const nextAttempts = voiceAttempts + 1;
                    setVoiceAttempts(nextAttempts);

                    if (nextAttempts >= 3) {
                        const msg = TTS.voiceFailed(0);
                        setError('Voice verification failed 3 times. Escalating to Face Verification.');
                        await speak(msg);
                        setAuthStep(2);
                        setTimeout(() => speak(TTS.facePrompt()), 800);
                    } else {
                        const remaining = 3 - nextAttempts;
                        const errMsg = err.message || 'Voice verification failed.';
                        setError(`${errMsg} (${remaining} attempts remaining)`);
                        await speak(TTS.voiceFailed(remaining));
                    }
                } finally {
                    setIsVerifying(false);
                }
            };

            mediaRecorder.start(250); // emit data every 250ms for reliable chunking
            setIsRecording(true);
        } catch (err) {
            console.error("Microphone error:", err);
            setError("Microphone access denied.");
        }
    };

    const handleStopVoice = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    // --- Face Verification Handlers ---
    const handleStartCamera = async () => {
        try {
            setError('');
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsCameraActive(true);
            }
        } catch (err) {
            console.error("Camera error:", err);
            setError("Camera access denied.");
        }
    };

    const handleCaptureAndVerifyFace = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        if (!faceModelsLoaded) {
            setError('AI face recognition models are still loading. Please wait a moment and try again.');
            return;
        }

        setIsVerifying(true);
        setError('');

        try {
            // Small delay to let video frame fully render
            await new Promise(r => setTimeout(r, 300));

            // Use lower scoreThreshold for better indoor/normal lighting detection
            const detection = await faceapi
                .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                throw new Error('No face detected. Please ensure your face is well-lit, centred, and the camera is unobstructed.');
            }

            // Draw to canvas for visual feedback
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);

            // Stop camera cleanly
            const stream = videoRef.current.srcObject;
            if (stream) stream.getTracks().forEach(track => track.stop());
            setIsCameraActive(false);

            // Extract the 128-d face descriptor
            const capturedDescriptor = Array.from(detection.descriptor);

            const response = await fetch('http://127.0.0.1:5005/api/verify/face', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email, capturedEmbedding: capturedDescriptor })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || 'Face verification server error.');

            if (!data.isMatch) {
                const nextFaceAttempts = faceAttempts + 1;
                setFaceAttempts(nextFaceAttempts);
                if (nextFaceAttempts >= 3) {
                    setError('Face verification failed 3 times. Transaction halted for security.');
                    await speak(TTS.faceFailed(0));
                    setAuthStep(4);
                } else {
                    const remaining = 3 - nextFaceAttempts;
                    const msg = `Face did not match enrolled record. Confidence: ${data.confidence}% (Distance: ${data.distance}, need < ${data.threshold}). Please try again.`;
                    setError(msg);
                    await speak(TTS.faceFailed(remaining));
                }
                return;
            }

            console.log(`[PaymentAuth] Face verified: ${data.confidence}% confidence, distance: ${data.distance}`);

            // Proceed to payment confirmation
            setAuthStep(3);

        } catch (err) {
            // Ensure camera turns off even if extraction crashed
            const stream = videoRef.current?.srcObject;
            if (stream) stream.getTracks().forEach(track => track.stop());
            setIsCameraActive(false);

            const nextAttempts = faceAttempts + 1;
            setFaceAttempts(nextAttempts);

            if (nextAttempts >= 3) {
                setError('Face verification failed 3 times. Transaction halted for your security.');
                await speak(TTS.faceFailed(0));
                setAuthStep(4);
            } else {
                const remaining = 3 - nextAttempts;
                setError(`${err.message || 'Face verification failed.'} (${remaining} attempts remaining)`);
                await speak(TTS.faceFailed(remaining));
            }
        } finally {
            setIsVerifying(false);
        }
    };

    const handleProcessPayment = async () => {
        setIsProcessingPayment(true);
        setError('');

        try {
            const response = await fetch('http://127.0.0.1:5005/api/payment/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user.email,
                    amount: amount,
                    recipientName: recipient.name
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Payment Failed');
            }

            // Update global auth context immediately
            login({
                ...user,
                balance: data.newBalance,
                transactions: [data.transaction, ...(user.transactions || [])]
            });

            // Announce success via TTS, then navigate home
            await speak(TTS.paymentSuccess(amount, recipient.name));
            navigate('/');

        } catch (err) {
            console.error(err);
            setError(err.message || 'Error occurred while processing payment');
        } finally {
            setIsProcessingPayment(false);
        }
    };

    // Prevent crashing if state is empty during redirect
    if (!nlpResult?.amount) return null;

    return (
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 max-w-md mx-auto relative overflow-hidden shadow-[0_0_50px_-12px_rgba(0,0,0,0.3)] bg-white dark:bg-slate-950 sm:border-x border-slate-200 dark:border-slate-800">
            {/* Header */}
            <header className="px-6 py-5 flex items-center justify-between z-20 sticky top-0 bg-white/50 dark:bg-slate-950/50 backdrop-blur-md">
                <button
                    onClick={() => navigate('/')}
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                    <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </button>
                <h1 className="text-sm font-bold tracking-widest uppercase text-slate-500">Secure Checkout</h1>
                <div className="w-10"></div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 pb-28 flex flex-col items-center">

                {/* Transaction Summary Box */}
                <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 shadow-sm mb-8 flex flex-col items-center text-center animate-in slide-in-from-top-4">
                    <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center mb-4">
                        <DollarSign className="w-7 h-7" />
                    </div>
                    <p className="text-slate-500 font-medium mb-1">Paying <span className="font-bold text-slate-800 dark:text-slate-200">{recipient.name}</span></p>
                    <h2 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">₹{amount.toLocaleString()}</h2>

                    {requiresFaceVerification && (
                        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-amber-200/50 dark:border-amber-900/50">
                            <ShieldAlert className="w-3.5 h-3.5" /> High-Value Transaction MFA
                        </div>
                    )}
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="w-full p-4 mb-6 bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-900/50 rounded-2xl text-sm font-medium text-center animate-in shake">
                        {error}
                    </div>
                )}

                {/* --- STEPS UI --- */}
                <div className="w-full flex-1 flex flex-col justify-end">

                    {/* STEP 1: VOICE VERIFICATION */}
                    {authStep === 1 && (
                        <div className="flex flex-col items-center animate-in slide-in-from-bottom-8 duration-500 w-full">
                            <div className="mb-6 text-center w-full">
                                <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-3">
                                    Hold the mic and read <strong>the full sentence</strong> below:
                                </p>
                                {/* Passphrase card — clearly shows what to say */}
                                <div className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl px-5 py-4 mb-3">
                                    <p className="text-base font-bold text-blue-800 dark:text-blue-200 italic leading-relaxed">
                                        "I confirm payment of ₹{amount.toLocaleString()} to {recipient.name}."
                                    </p>
                                </div>
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-1.5">
                                    ⚠️ Partial phrases will be rejected — speak the full sentence clearly.
                                </p>
                            </div>

                            {isVerifying ? (
                                <div className="flex flex-col items-center gap-4 py-8">
                                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                                    <p className="text-sm font-medium text-slate-500">Verifying Voiceprint...</p>
                                </div>
                            ) : (
                                <button
                                    onMouseDown={handleStartVoice}
                                    onMouseUp={handleStopVoice}
                                    onTouchStart={handleStartVoice}
                                    onTouchEnd={handleStopVoice}
                                    className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl
                                        ${isRecording
                                            ? 'bg-blue-600 text-white scale-110 shadow-blue-500/50 animate-pulse'
                                            : 'bg-white dark:bg-slate-800 text-blue-600 border-[8px] border-blue-50 dark:border-blue-900/30'}`}
                                >
                                    <Mic className="w-10 h-10" />
                                </button>
                            )}
                            <p className="mt-6 text-xs text-slate-400 font-medium">Hold to record, release to verify.</p>
                        </div>
                    )}


                    {/* STEP 2: FACE VERIFICATION (Conditional) */}
                    {authStep === 2 && (
                        <div className="flex flex-col items-center w-full animate-in slide-in-from-right-8 duration-500">
                            <div className="mb-6 text-center">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Extra Security Required</h3>
                                <p className="text-xs text-slate-500 mt-1">High-value transactions require Face ID.</p>
                            </div>

                            <div className="relative w-full aspect-[3/4] max-w-[260px] rounded-3xl overflow-hidden bg-slate-100 dark:bg-slate-900 mx-auto shadow-inner border-[6px] border-white dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none mb-8">
                                <video ref={videoRef} autoPlay playsInline muted className="object-cover w-full h-full" />
                                {!isCameraActive && !isVerifying && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Camera className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                                    </div>
                                )}
                                {isVerifying && (
                                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                                        <Loader2 className="w-10 h-10 animate-spin mb-3" />
                                        <span className="text-xs font-bold tracking-wider">VERIFYING FACE</span>
                                    </div>
                                )}
                            </div>
                            <canvas ref={canvasRef} className="hidden" />

                            {!isVerifying && (
                                isCameraActive ? (
                                    <button
                                        onClick={handleCaptureAndVerifyFace}
                                        disabled={!faceModelsLoaded}
                                        className={`w-full py-4 font-bold rounded-2xl shadow-lg transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${!faceModelsLoaded
                                            ? 'bg-indigo-400 cursor-not-allowed text-white'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/30'
                                            }`}
                                    >
                                        {!faceModelsLoaded ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading AI...</> : 'Scan Face'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleStartCamera}
                                        className="w-full py-4 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-2xl shadow-lg transition-all text-sm uppercase tracking-wider"
                                    >
                                        Turn On Camera
                                    </button>
                                )
                            )}
                        </div>
                    )}

                    {/* STEP 3: SUCCESS */}
                    {authStep === 3 && (
                        <div className="flex flex-col items-center text-center py-10 animate-in zoom-in duration-500 delay-150">
                            <div className="w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-500 flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20">
                                <CheckCircle2 className="w-14 h-14" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Verified Successfully</h2>
                            <p className="text-slate-500 text-sm mb-8">Your biometrics matched securely.</p>

                            <button
                                onClick={handleProcessPayment}
                                disabled={isProcessingPayment}
                                className={`w-full py-4 ${isProcessingPayment ? 'bg-emerald-400' : 'bg-emerald-500 hover:bg-emerald-600'} text-white font-bold rounded-2xl shadow-lg shadow-emerald-500/30 transition-all text-sm uppercase tracking-wider flex justify-center items-center gap-2`}
                            >
                                {isProcessingPayment ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                                {isProcessingPayment ? 'Processing...' : 'Send Payment Now'}
                            </button>
                        </div>
                    )}

                    {/* STEP 4: HALTED */}
                    {authStep === 4 && (
                        <div className="flex flex-col items-center text-center py-10 animate-in zoom-in duration-500 delay-150">
                            <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/40 text-red-500 flex items-center justify-center mb-6 shadow-xl shadow-red-500/20">
                                <ShieldAlert className="w-14 h-14" />
                            </div>
                            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Transaction Halted</h2>
                            <p className="text-slate-500 text-sm mb-8">Multiple failed verification attempts detected. Your security is our priority.</p>

                            <button
                                onClick={() => navigate('/')}
                                className="w-full py-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-2xl transition-all text-sm uppercase tracking-wider"
                            >
                                Return to Dashboard
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
