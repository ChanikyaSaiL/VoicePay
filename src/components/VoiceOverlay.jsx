import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, X, AlertCircle, Send, Users, CheckCircle, Loader2 } from 'lucide-react';
import { speak, stopSpeaking, TTS } from '../utils/tts';

export default function VoiceOverlay({ isListening, isProcessing, transcript, error, stopListening, nlpResult, contactStatus, matchedContacts }) {
    const navigate = useNavigate();

    // Voice disambiguation for multiple contacts
    const [isDisambiguating, setIsDisambiguating] = useState(false);
    const [disambError, setDisambError] = useState('');
    const disambRecorderRef = useRef(null);

    // ─── Speak the right prompt whenever contactStatus changes ───────────────
    useEffect(() => {
        if (!nlpResult?.amount) return;

        if (contactStatus === 'MULTIPLE' && matchedContacts?.length > 0) {
            const names = matchedContacts.map(c => c.name);
            speak(TTS.multipleContacts(names));
        } else if (contactStatus === 'NONE' && nlpResult?.name) {
            speak(TTS.noContact(nlpResult.name));
        } else if (contactStatus === 'SINGLE' && matchedContacts?.[0]) {
            speak(TTS.singleContact(matchedContacts[0].name, nlpResult.amount));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contactStatus]);

    // Stop speaking when overlay closes
    useEffect(() => {
        return () => stopSpeaking();
    }, []);

    // ─── Voice Disambiguation: listen for user saying a contact name ─────────
    const handleVoiceDisambiguate = async () => {
        setDisambError('');
        setIsDisambiguating(true);
        try {
            await speak("Listening... say the full name of the contact.");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
            const recorder = new MediaRecorder(stream, { mimeType });
            disambRecorderRef.current = recorder;
            const chunks = [];

            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(chunks, { type: mimeType });
                const formData = new FormData();
                formData.append('audio', blob, `disamb.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`);

                try {
                    const res = await fetch('http://127.0.0.1:5005/api/speech/transcribe', { method: 'POST', body: formData });
                    const data = await res.json();
                    const heard = (data.transcript || '').toLowerCase().trim();

                    // Find best matching contact by checking if the transcript contains their name
                    const matched = matchedContacts.find(c =>
                        heard.includes(c.name.toLowerCase()) ||
                        c.name.toLowerCase().split(' ').some(part => heard.includes(part.toLowerCase()))
                    );

                    if (matched) {
                        await speak(`Selected ${matched.name}. Proceeding to authentication.`);
                        navigate('/payment-auth', { state: { nlpResult, matchedContacts: [matched] } });
                    } else {
                        const names = matchedContacts.map(c => c.name);
                        setDisambError(`Could not understand. Heard: "${data.transcript}". Please try again.`);
                        await speak(`I heard "${data.transcript}" but could not match a contact. Please say ${names.join(' or ')}.`);
                    }
                } catch {
                    setDisambError('Error transcribing audio. Please try again.');
                } finally {
                    setIsDisambiguating(false);
                }
            };

            recorder.start();
            // Record for 4 seconds then auto-stop
            setTimeout(() => {
                if (recorder.state === 'recording') recorder.stop();
            }, 4000);

        } catch (err) {
            console.error('Disambiguation error:', err);
            setIsDisambiguating(false);
        }
    };

    if (!isListening && !isProcessing && !nlpResult.amount && !transcript && !error) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
            {/* Top Close Button */}
            <button
                onClick={() => {
                    stopSpeaking();
                    if (isListening) stopListening(true);
                    else navigate(-1);
                }}
                className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700 hover:text-red-400 transition"
                title="Cancel & Close"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Main Content Box */}
            <div className="w-full max-w-md bg-white dark:bg-slate-950 h-[80vh] rounded-t-[40px] shadow-2xl flex flex-col items-center p-8 relative overflow-hidden animate-in slide-in-from-bottom-32 duration-500">

                {/* Dynamic Background */}
                <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-t pointer-events-none transition-all duration-700
                    ${isListening ? 'from-blue-500/10 to-transparent' :
                        contactStatus === 'MULTIPLE' ? 'from-amber-500/10 to-transparent' :
                            contactStatus === 'NONE' ? 'from-red-500/10 to-transparent' :
                                'from-indigo-500/10 to-transparent'
                    }`} />

                {/* State Indicator Icon */}
                <div className="relative z-10 mt-10">
                    {isListening ? (
                        <div className="relative flex flex-col items-center gap-6">
                            <div className="relative cursor-pointer group" onClick={() => stopListening(false)} title="Click to Stop & Analyze">
                                <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl animate-pulse opacity-50 group-hover:opacity-75 transition" />
                                <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-2xl relative z-10 animate-pulse group-hover:scale-110 transition-transform">
                                    <Mic className="text-white w-10 h-10" />
                                </div>
                            </div>
                            <span className="text-blue-500 font-bold tracking-widest uppercase text-xs animate-pulse">Click to Process</span>
                        </div>
                    ) : isProcessing ? (
                        <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-xl">
                            <Loader2 className="text-blue-500 w-10 h-10 animate-spin" />
                        </div>
                    ) : isDisambiguating ? (
                        <div className="relative flex flex-col items-center gap-3">
                            <div className="absolute inset-0 bg-amber-400 rounded-full blur-xl animate-pulse opacity-40" />
                            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-2xl relative z-10 animate-pulse">
                                <Mic className="text-white w-10 h-10" />
                            </div>
                            <span className="text-amber-500 font-bold tracking-widest uppercase text-xs animate-pulse">Listening 4s...</span>
                        </div>
                    ) : contactStatus === 'MULTIPLE' ? (
                        <div className="w-24 h-24 rounded-full bg-amber-100 flex items-center justify-center shadow-xl">
                            <Users className="text-amber-600 w-10 h-10 animate-in zoom-in" />
                        </div>
                    ) : contactStatus === 'NONE' ? (
                        <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center shadow-xl">
                            <AlertCircle className="text-red-500 w-10 h-10 animate-in zoom-in" />
                        </div>
                    ) : (
                        <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center shadow-xl">
                            <Send className="text-indigo-600 w-10 h-10 animate-in zoom-in" />
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className="mt-12 text-center relative z-10 w-full flex-1">
                    {error ? (
                        <h2 className="text-2xl font-semibold text-red-500">{error}</h2>
                    ) : isListening ? (
                        <div>
                            <p className="text-slate-500 dark:text-slate-400 font-medium mb-2">Listening...</p>
                            <h2 className="text-2xl font-light text-slate-400 dark:text-slate-500 leading-tight">Speak your payment command...</h2>
                        </div>
                    ) : isProcessing ? (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <p className="text-slate-500 dark:text-slate-400 font-medium mb-2">Analyzing Audio...</p>
                            <h2 className="text-xl font-light text-slate-400 dark:text-slate-500 leading-tight">Transcribing via Whisper AI</h2>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
                            <p className="text-slate-500 dark:text-slate-400 font-medium mb-6">Payment Intent Detected</p>

                            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-slate-500 dark:text-slate-400">Amount</span>
                                    <span className="text-2xl font-bold text-slate-800 dark:text-white">
                                        {nlpResult?.amount ? `₹${nlpResult.amount}` : '???'}
                                    </span>
                                </div>

                                <div className="h-px w-full bg-slate-200 dark:bg-slate-800 my-4" />

                                <div className="flex flex-col text-left">
                                    <span className="text-slate-500 dark:text-slate-400 mb-2">Recipient</span>

                                    {/* ── MULTIPLE CONTACTS ── */}
                                    {contactStatus === 'MULTIPLE' ? (
                                        <div className="w-full">
                                            <p className="text-amber-600 font-medium text-sm mb-3 text-center">Multiple matches found. Select one:</p>

                                            {/* Voice Disambiguate Button */}
                                            <button
                                                onClick={handleVoiceDisambiguate}
                                                disabled={isDisambiguating}
                                                className="w-full flex items-center justify-center gap-2 p-3 mb-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-400 text-amber-700 dark:text-amber-400 font-semibold text-sm hover:bg-amber-100 transition disabled:opacity-60"
                                            >
                                                <Mic className="w-4 h-4" />
                                                {isDisambiguating ? 'Listening for name...' : 'Say the contact name 🎤'}
                                            </button>

                                            {disambError && (
                                                <p className="text-xs text-red-500 mb-2 text-center">{disambError}</p>
                                            )}

                                            <p className="text-xs text-slate-400 text-center mb-2">— or tap to select —</p>

                                            {/* Tap-to-select fallback */}
                                            <div className="flex flex-col gap-2">
                                                {matchedContacts.map((c) => (
                                                    <button
                                                        key={c.id}
                                                        onClick={async () => {
                                                            stopSpeaking();
                                                            await speak(`Selected ${c.name}. Proceeding to authentication.`);
                                                            navigate('/payment-auth', { state: { nlpResult, matchedContacts: [c] } });
                                                        }}
                                                        className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-950 border border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-900/20 active:scale-[0.98] transition text-left cursor-pointer"
                                                    >
                                                        <div>
                                                            <p className="font-bold text-slate-800 dark:text-slate-200">{c.name}</p>
                                                            <p className="text-xs text-slate-500">{c.upi}</p>
                                                        </div>
                                                        <CheckCircle className="w-5 h-5 text-amber-500/50" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        /* ── NO CONTACT ── */
                                    ) : contactStatus === 'NONE' ? (
                                        <p className="text-red-500 font-semibold text-center py-2">No contact matched "{nlpResult?.name}"</p>

                                        /* ── SINGLE CONTACT ── */
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center">
                                                {matchedContacts[0]?.initial || '?'}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 dark:text-slate-200">{matchedContacts[0]?.name || nlpResult?.name}</p>
                                                <p className="text-xs text-slate-500">{matchedContacts[0]?.upi || 'Extracted Name'}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── Proceed Button (single match) ── */}
                            {contactStatus === 'SINGLE' && (
                                <button
                                    onClick={async () => {
                                        stopSpeaking();
                                        navigate('/payment-auth', { state: { nlpResult, matchedContacts } });
                                    }}
                                    className="w-full mt-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <span>Proceed to Authentication</span>
                                    <CheckCircle className="w-5 h-5 group-hover:scale-110 transition" />
                                </button>
                            )}

                            {/* ── Cancel Button (no match) ── */}
                            {contactStatus === 'NONE' && (
                                <button onClick={() => { stopSpeaking(); stopListening(true); }} className="w-full mt-8 py-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-2xl transition-all">
                                    Cancel & Close
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
