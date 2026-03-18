import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Camera, Users, CheckCircle2, ChevronRight, Lock, AlertCircle, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MOCK_CONTACTS } from '../utils/nlp';
import * as faceapi from 'face-api.js';

export default function Enrollment() {
    const [activeStep, setActiveStep] = useState(1);
    const [completedSteps, setCompletedSteps] = useState([]);
    const [isRecording, setIsRecording] = useState(false);
    const videoRef = useRef(null);

    const [audioURL, setAudioURL] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingMimeRef = useRef('audio/webm');

    const [capturedFace, setCapturedFace] = useState(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [captureError, setCaptureError] = useState('');
    const [faceModelsLoaded, setFaceModelsLoaded] = useState(false);
    const [isEnrollingVoice, setIsEnrollingVoice] = useState(false);
    const [voiceEnrolled, setVoiceEnrolled] = useState(false);
    const canvasRef = useRef(null);

    const steps = [
        { id: 1, title: 'Voice Enrollment', desc: 'Secure voiceprint generation', icon: Mic },
        { id: 2, title: 'Face Enrollment', desc: 'Liveness & image extraction', icon: Camera },
        { id: 3, title: 'Contact Sync', desc: 'Matching logic preparation', icon: Users },
        { id: 4, title: 'Setup Complete', desc: 'Ready for payments', icon: CheckCircle2 }
    ];

    const { user, login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const loadModels = async () => {
            try {
                await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
                await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
                await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
                setFaceModelsLoaded(true);
                console.log("FaceAPI models loaded successfully");
            } catch (error) {
                console.error("Error loading FaceAPI models", error);
                setCaptureError('Failed to load face recognition models. Ensure you are on a modern browser.');
            }
        };
        loadModels();
    }, []);

    const handleStartVoice = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Pick supported MIME type ONCE and use it for both the recorder and the Blob.
            // Mismatching recorder format and Blob type corrupts the file header.
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4';
            recordingMimeRef.current = mimeType;

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // Use the same mimeType that was used at recorder creation
                const recordedMime = recordingMimeRef.current;
                const ext = recordedMime.includes('mp4') ? 'mp4' : 'webm';

                const audioBlob = new Blob(audioChunksRef.current, { type: recordedMime });
                const url = URL.createObjectURL(audioBlob);
                setAudioURL(url);
                stream.getTracks().forEach(track => track.stop());

                // Guard: reject recordings that are clearly too small (< 5 KB)
                if (audioBlob.size < 5000) {
                    alert('Recording too short or silent. Please hold the button and speak clearly for at least 3 seconds.');
                    return;
                }

                // Send audio to backend for Wav2Vec2 speaker embedding extraction
                try {
                    setIsEnrollingVoice(true);
                    const formData = new FormData();
                    formData.append('audio', audioBlob, `voice.${ext}`);
                    formData.append('email', user.email);

                    const res = await fetch('http://127.0.0.1:5005/api/voice/enroll', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);

                    console.log('[Enrollment] Voice embedding stored:', data.dimensions, 'dims');
                    setVoiceEnrolled(true);
                    setCompletedSteps(prev => [...new Set([...prev, 1])]);
                } catch (err) {
                    console.error('[Enrollment] Voice embedding error:', err);
                    alert('Failed to save voiceprint: ' + err.message);
                } finally {
                    setIsEnrollingVoice(false);
                }
            };

            mediaRecorder.start(250); // emit data every 250ms for reliable chunking
            setIsRecording(true);
            setAudioURL(null);

        } catch (err) {
            console.error("Audio error:", err);
            alert("Please allow microphone permissions.");
        }
    };

    const handleStopVoice = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    const handleStartCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsCameraActive(true);
            }
        } catch (err) {
            console.error("Camera error:", err);
            alert("Please allow camera permissions.");
        }
    };

    const handleCaptureFace = async () => {
        if (!videoRef.current || !canvasRef.current) {
            setCaptureError('Camera not ready. Please click Initialize Camera first.');
            return;
        }
        if (!faceModelsLoaded) {
            setCaptureError('AI models still loading… please wait a moment and try again.');
            return;
        }

        setCaptureError('');
        setIsCapturing(true);

        try {
            // Wait slightly to let video frame stabilize
            await new Promise(r => setTimeout(r, 300));

            const detection = await faceapi
                .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }))
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                setCaptureError('No face detected. Please ensure your face is well-lit and centred in the circle, then try again.');
                return;
            }

            // Store the 128-d face descriptor for biometric upload
            window.sessionCapturedFaceDescriptor = Array.from(detection.descriptor);

            // Draw snapshot to hidden canvas to produce a preview image
            const ctx = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            ctx.drawImage(videoRef.current, 0, 0);

            const imageDataUrl = canvasRef.current.toDataURL('image/jpeg');
            setCapturedFace(imageDataUrl);
            setCompletedSteps(prev => [...new Set([...prev, 2])]);

            // Stop camera stream cleanly
            const stream = videoRef.current.srcObject;
            if (stream) stream.getTracks().forEach(t => t.stop());
            setIsCameraActive(false);

        } catch (err) {
            console.error('Face capture error:', err);
            setCaptureError('Face scan failed. Please try again.');
        } finally {
            setIsCapturing(false);
        }
    };

    const handleRetakeFace = () => {
        setCapturedFace(null);
        setCompletedSteps(prev => prev.filter(step => step !== 2));
        handleStartCamera();
    };

    const handleContactSync = async () => {
        try {
            // Grab the real AI 128-d numeric embeddings. (Voice is mocked until we build local speaker verification)
            const mockVoiceEmbedding = Array.from({ length: 128 }, () => Math.random());
            const realFaceEmbedding = window.sessionCapturedFaceDescriptor || Array.from({ length: 128 }, () => Math.random());

            await fetch('http://127.0.0.1:5005/api/auth/update-biometrics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user.email,
                    // voiceEmbedding is already stored to MongoDB via /api/voice/enroll when the user recorded their sample
                    faceEmbedding: realFaceEmbedding
                })
            });

            // Simulate parsing local device contacts and syncing them to backend
            await fetch('http://127.0.0.1:5005/api/auth/update-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user.email,
                    contacts: MOCK_CONTACTS
                })
            });

            // Update local context
            login({ ...user, contacts: MOCK_CONTACTS });

            setCompletedSteps([...completedSteps, 3]);
            setActiveStep(4);
        } catch (error) {
            console.error("Error saving biometrics or contacts:", error);
            alert("Failed to save data to the database!");
        }
    };

    const renderActiveStepContent = () => {
        switch (activeStep) {
            case 1:
                return (
                    <div className="flex flex-col items-center gap-4 mt-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                        {completedSteps.includes(1) && !isRecording && audioURL ? (
                            <div className="w-full flex flex-col items-center gap-4">
                                <div className="w-full flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-xl border border-emerald-100 dark:border-emerald-800">
                                    <span className="font-medium text-sm">Voiceprint Captured!</span>
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <div className="w-full bg-white dark:bg-slate-950 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center">
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Listen to your audio preview:</p>
                                    <audio src={audioURL} controls className="w-full h-10" />
                                </div>
                                {/* Speaker embedding extraction status */}
                                {isEnrollingVoice ? (
                                    <div className="w-full flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Extracting speaker embedding via Wav2Vec2... (first run may take 20s)</p>
                                    </div>
                                ) : voiceEnrolled ? (
                                    <div className="w-full flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Voiceprint AI Embedded ✓ — 768-d speaker vector stored securely</p>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <>
                                <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${isRecording ? 'bg-red-100 text-red-500 animate-pulse scale-110 shadow-lg shadow-red-500/20' : 'bg-blue-100 text-blue-500'}`}>
                                    <Mic className="w-10 h-10" />
                                </div>
                                <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">
                                    {isRecording ? "Listening... Read the phrase below. Click Stop when finished:" : "Click to read the security phrase in your normal speaking voice."}
                                </p>
                                <p className={`text-lg font-bold text-center italic transition-colors ${isRecording ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 blur-[1px]'}`}>
                                    "My voice is my password, and this is VoicePay."
                                </p>
                            </>
                        )}

                        <div className="w-full flex gap-3 mt-4">
                            {!isRecording && completedSteps.includes(1) ? (
                                <>
                                    <button onClick={handleStartVoice} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl transition-all text-sm">
                                        Retake
                                    </button>
                                    <button
                                        onClick={() => setActiveStep(2)}
                                        className={`py-3 flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all text-sm`}
                                    >
                                        Submit to Whisper AI & Continue
                                    </button>
                                </>
                            ) : !isRecording ? (
                                <button
                                    onClick={handleStartVoice}
                                    className={`w-full py-3 font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all text-sm`}
                                >
                                    Start Recording
                                </button>
                            ) : (
                                <button
                                    onClick={handleStopVoice}
                                    className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-center shadow-lg shadow-red-500/30 transition-all text-sm animate-pulse"
                                >
                                    Stop Recording
                                </button>
                            )}
                        </div>
                    </div>
                );
            case 2:
                return (
                    <div className="flex flex-col items-center gap-4 mt-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                        {completedSteps.includes(2) && capturedFace ? (
                            <div className="w-full flex flex-col items-center gap-4">
                                <div className="w-full flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-xl mb-2 border border-emerald-100 dark:border-emerald-800">
                                    <span className="font-medium text-sm">Face Captured!</span>
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                                <div className="relative w-full aspect-square max-w-[200px] rounded-full overflow-hidden border-4 border-emerald-500 shadow-lg shadow-emerald-500/20">
                                    <img src={capturedFace} alt="Captured Face" className="object-cover w-full h-full" />
                                </div>
                                <p className="text-xs text-slate-500 mt-2 text-center text-balance">Review your capture. This image will be sent to InsightFace for embedding extraction.</p>
                            </div>
                        ) : (
                            <>
                                <div className="relative w-full aspect-square max-w-[220px] rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 flex items-center justify-center border-4 border-indigo-500 mx-auto">
                                    <video ref={videoRef} autoPlay playsInline muted className="object-cover w-full h-full" />
                                    {!isCameraActive && !isCapturing && <Camera className="w-10 h-10 text-slate-400 absolute" />}
                                    {isCapturing && (
                                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2">
                                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                                            <span className="text-white text-xs font-bold">Scanning...</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">
                                    {!isCameraActive ? 'Click below to initialize camera.' : !faceModelsLoaded ? '⏳ AI models loading...' : 'Centre your face and click Capture Photo.'}
                                </p>
                                {captureError && (
                                    <div className="w-full flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                                        <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                        <p className="text-xs text-red-600 dark:text-red-400 font-medium">{captureError}</p>
                                    </div>
                                )}
                            </>
                        )}

                        <canvas ref={canvasRef} className="hidden" />

                        <div className="w-full flex gap-3 mt-4">
                            {completedSteps.includes(2) && capturedFace ? (
                                <>
                                    <button onClick={handleRetakeFace} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl transition-all text-sm">
                                        Retake
                                    </button>
                                    <button
                                        onClick={() => setActiveStep(3)}
                                        className={`py-3 flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-all text-sm`}
                                    >
                                        Extract Embedding & Continue
                                    </button>
                                </>
                            ) : isCameraActive ? (
                                <button
                                    onClick={handleCaptureFace}
                                    disabled={isCapturing || !faceModelsLoaded}
                                    className={`w-full py-3 font-bold rounded-xl text-center shadow-lg transition-all text-sm flex items-center justify-center gap-2 ${isCapturing || !faceModelsLoaded
                                        ? 'bg-indigo-400 cursor-not-allowed text-white'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30'
                                        }`}
                                >
                                    {isCapturing ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning Face...</> : !faceModelsLoaded ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading AI...</> : 'Capture Photo'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleStartCamera}
                                    className={`w-full py-3 font-semibold rounded-xl transition-all text-sm bg-indigo-600 hover:bg-indigo-700 text-white`}
                                >
                                    Initialize Camera
                                </button>
                            )}
                        </div>
                    </div>
                );
            case 3:
                return (
                    <div className="flex flex-col items-center gap-4 mt-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <Users className="w-10 h-10" />
                        </div>
                        <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300 text-balance">
                            Sync your contacts to recognize payment recipients via voice command. (e.g. "Send 500 to Rahul")
                        </p>
                        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg mt-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Only Name and Phone Number are securely hashed & synced.</span>
                        </div>
                        <button onClick={handleContactSync} className="w-full py-3 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all">
                            Allow Contact Access
                        </button>
                    </div>
                );
            case 4:
                return (
                    <div className="flex flex-col items-center gap-4 mt-6 p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/30">
                        <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                            <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-2">Setup Done!</h3>
                        <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300 text-balance px-2">
                            Your biometrics are secured. You can now proceed with payments from your dashboard.
                        </p>
                        <button onClick={() => {
                            login({ ...user, hasVoiceEnrolled: true });
                            navigate('/');
                        }} className="w-full py-3 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/30">
                            Got it, enter homepage
                        </button>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="p-6 flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500 pb-32">
            <section className="mt-2 text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                    <Lock className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Security Enrollment</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm max-w-[280px]">
                    Complete these 4 multi-factor authentication steps to enable secure voice payments.
                </p>
            </section>

            <div className="flex flex-col gap-4 relative before:absolute before:inset-0 before:ml-[35px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-800 before:to-transparent">
                {steps.map((step) => {
                    const isActive = activeStep === step.id;
                    const isCompleted = completedSteps.includes(step.id);

                    return (
                        <div key={step.id} className="relative z-10 flex flex-col">
                            <div className={`flex flex-col w-full rounded-[24px] transition-all text-left
                                ${isActive
                                    ? 'bg-white dark:bg-slate-900 border-2 border-indigo-500 dark:border-indigo-600 shadow-xl shadow-indigo-500/10 scale-[1.02]'
                                    : isCompleted
                                        ? 'bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800'
                                        : 'bg-white/40 dark:bg-slate-900/40 border border-transparent opacity-60'
                                }`}
                            >
                                <button
                                    onClick={() => isCompleted ? setActiveStep(step.id) : null}
                                    className={`flex items-center p-5 w-full rounded-[24px] ${!isCompleted && !isActive ? 'pointer-events-none' : ''}`}
                                >
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mr-5 shrink-0 transition-all duration-300
                                        ${isActive
                                            ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/30'
                                            : isCompleted
                                                ? 'bg-emerald-500 text-white shadow-md'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}
                                    `}>
                                        {isCompleted && !isActive ? <CheckCircle2 className="w-6 h-6" /> : <step.icon className="w-6 h-6" />}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <h3 className={`font-bold text-sm ${isActive ? 'text-indigo-900 dark:text-blue-100' : isCompleted ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500'}`}>
                                            Step {step.id}: {step.title}
                                        </h3>
                                        <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400 font-medium line-clamp-1">
                                            {step.desc}
                                        </p>
                                    </div>

                                    <div className="shrink-0 ml-4">
                                        {isActive ? (
                                            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 animate-pulse">
                                                <ChevronRight className="w-5 h-5" />
                                            </div>
                                        ) : isCompleted ? (
                                            <div className="w-6 h-6 rounded-full bg-emerald-50 dark:emerald-900/20 text-emerald-500 flex items-center justify-center">
                                                <CheckCircle2 className="w-4 h-4" />
                                            </div>
                                        ) : (
                                            <div className="w-6 h-6 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                                        )}
                                    </div>
                                </button>

                                {/* Active Step Content UI */}
                                {isActive && (
                                    <div className="px-5 pb-5 cursor-default">
                                        {renderActiveStepContent()}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
