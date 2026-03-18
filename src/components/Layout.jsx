import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Mic, User, Home as HomeIcon, Settings, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
import useSpeechRecognition from '../hooks/useSpeechRecognition';
import { parsePaymentCommand, resolveContact, MOCK_CONTACTS } from '../utils/nlp';
import { useAuth } from '../context/AuthContext';
import VoiceOverlay from './VoiceOverlay';

export default function Layout() {
    const { isListening, isProcessing, transcript, error, startListening, stopListening, resetTranscript } = useSpeechRecognition();
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [nlpResult, setNlpResult] = useState({ amount: null, name: null });
    const [contactStatus, setContactStatus] = useState(null); // SINGLE, MULTIPLE, NONE
    const [matchedContacts, setMatchedContacts] = useState([]);

    // Process transcript once inference finishes
    useEffect(() => {
        if (!isListening && !isProcessing && transcript) {
            const parsed = parsePaymentCommand(transcript);
            setNlpResult(parsed);

            const userContacts = user?.contacts?.length > 0 ? user.contacts : MOCK_CONTACTS;
            const resolution = resolveContact(parsed.name, userContacts);
            setContactStatus(resolution.status);
            setMatchedContacts(resolution.matches);
        }
    }, [isListening, transcript, user]);

    const handleStartVoice = () => {
        resetTranscript();
        setNlpResult({ amount: null, name: null });
        setContactStatus(null);
        setMatchedContacts([]);
        startListening();
    };

    const handleCloseOverlay = () => {
        stopListening();
        resetTranscript();
        setNlpResult({ amount: null, name: null });
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 max-w-md mx-auto relative overflow-hidden shadow-[0_0_50px_-12px_rgba(0,0,0,0.3)] bg-white dark:bg-slate-950 sm:border-x border-slate-200 dark:border-slate-800 transition-colors">

            {/* Voice Payment Overlay */}
            <VoiceOverlay
                isListening={isListening}
                isProcessing={isProcessing}
                transcript={transcript}
                error={error}
                stopListening={handleCloseOverlay}
                nlpResult={nlpResult}
                contactStatus={contactStatus}
                matchedContacts={matchedContacts}
            />

            {/* Header */}
            <header className="px-6 py-5 flex justify-between items-center bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl z-20 sticky top-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Mic className="text-white w-5 h-5" />
                    </div>
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 dark:from-blue-400 dark:to-indigo-300">
                        VoicePay
                    </h1>
                </div>
                <button
                    onClick={() => {
                        logout();
                        navigate('/auth');
                    }}
                    title="Log Out"
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition active:scale-95 border border-slate-200 dark:border-slate-700"
                >
                    <LogOut className="w-5 h-5 text-slate-600 dark:text-slate-300 ml-1" />
                </button>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto pb-28 relative scroll-smooth">
                {/* Background glow effects */}
                <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-900/10 pointer-events-none"></div>
                <div className="absolute top-[-10%] left-[-20%] w-72 h-72 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none mix-blend-multiply dark:mix-blend-screen"></div>
                <div className="absolute bottom-[20%] right-[-20%] w-72 h-72 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none mix-blend-multiply dark:mix-blend-screen"></div>

                <div className="relative z-10 h-full">
                    <Outlet />
                </div>
            </main>

            {/* Bottom Navigation */}
            <footer className="absolute bottom-0 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50 pb-safe z-30 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
                <nav className="flex justify-between items-center px-8 py-4">
                    <Link to="/" className="flex flex-col items-center gap-1.5 text-blue-600 dark:text-blue-400 group">
                        <div className="p-2 rounded-xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/40 transition">
                            <HomeIcon className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-semibold tracking-wide">Home</span>
                    </Link>

                    <div className="relative -top-8 flex flex-col items-center">
                        <button
                            onClick={handleStartVoice}
                            className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/40 flex items-center justify-center transform hover:scale-105 active:scale-95 transition-all text-shadow"
                        >
                            <Mic className="w-7 h-7" />
                        </button>
                        <span className="text-[11px] font-semibold mt-2 text-slate-600 dark:text-slate-400 tracking-wide">Pay now</span>
                    </div>

                    <Link to="/setup" className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 group transition">
                        <div className="p-2 rounded-xl group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition">
                            <Settings className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-medium tracking-wide">Setup</span>
                    </Link>
                </nav>
            </footer>
        </div>
    );
}
