import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, PieChart, Activity, DollarSign, Calendar, Mic, Loader2, X, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { speak, stopSpeaking } from '../utils/tts';
import { parseAnalyticsQuery } from '../utils/nlpAnalytics';

export default function Analytics() {
    const { user } = useAuth();
    const [animatedData, setAnimatedData] = useState([]);

    // --- Voice Assistant State ---
    const [isListening, setIsListening] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [assistantAnswer, setAssistantAnswer] = useState('');
    const [userQuery, setUserQuery] = useState('');
    const mediaRecorderRef = useRef(null);
    const generateSeededData = (seedStr) => {
        let seed = 0;
        const str = seedStr || 'guest';
        for (let i = 0; i < str.length; i++) {
            seed += str.charCodeAt(i);
        }
        const random = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };
        // Generate 6 months of data
        return Array.from({ length: 6 }, () => Math.floor(random() * 8000) + 1500);
    };

    const monthlyData = generateSeededData(user?.name);
    const totalSpend = monthlyData.reduce((a, b) => a + b, 0);
    const averageSpend = Math.round(totalSpend / 6);

    // Simulate trend (positive/negative)
    const isSpendingUp = monthlyData[5] > monthlyData[4];
    const trendPercentage = Math.abs(Math.round(((monthlyData[5] - monthlyData[4]) / monthlyData[4]) * 100));

    const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    const maxVal = Math.max(...monthlyData);

    useEffect(() => {
        // Trigger animation on mount
        const timer = setTimeout(() => {
            setAnimatedData(monthlyData);
        }, 100);
        return () => clearTimeout(timer);
    }, [user?.name]);

    // --- Voice Assistant Logic ---
    const handleStartVoice = async () => {
        try {
            stopSpeaking();
            setAssistantAnswer('');
            setUserQuery('');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = mediaRecorder;
            const chunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                setIsTranscribing(true);
                stream.getTracks().forEach(track => track.stop());

                const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
                const audioBlob = new Blob(chunks, { type: mimeType });
                const form = new FormData();
                form.append('audio', audioBlob, `query.${ext}`);

                try {
                    const res = await fetch('http://127.0.0.1:5005/api/speech/transcribe', {
                        method: 'POST',
                        body: form
                    });

                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message || 'Transcription failed');

                    const transcript = data.transcript || '';
                    setUserQuery(`"${transcript}"`);

                    // 1. Send the natural language query + raw transaction history to NLP utility
                    const answer = parseAnalyticsQuery(transcript, user.transactions || []);
                    
                    // 2. Display and speak the answer
                    setAssistantAnswer(answer);
                    speak(answer);

                } catch (err) {
                    console.error("Assistant Error:", err);
                    setAssistantAnswer("Sorry, I had trouble processing that. Please try again.");
                    speak("Sorry, I had trouble processing that. Please try again.");
                } finally {
                    setIsTranscribing(false);
                }
            };

            mediaRecorder.start(250);
            setIsListening(true);
            speak("I'm listening.");
        } catch (err) {
            console.error("Mic error:", err);
            setAssistantAnswer("Please allow microphone access to use the assistant.");
        }
    };

    const handleStopVoice = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsListening(false);
        }
    };

    const closeAssistant = () => {
        stopSpeaking();
        setAssistantAnswer('');
        setUserQuery('');
        if (isListening) handleStopVoice();
    };


    return (
        <div className="p-6 flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500 pb-32 relative">
            {/* Header */}
            <header className="flex items-center gap-4 mt-2">
                <Link to="/" className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Analytics</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Your financial overview</p>
                </div>
            </header>

            {/* Total Spend Card */}
            <section className="relative p-6 rounded-[28px] bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-950 text-white overflow-hidden shadow-2xl shadow-slate-900/20 group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-700">
                    <PieChart className="w-32 h-32" />
                </div>

                <div className="relative z-10 flex flex-col gap-6">
                    <div>
                        <p className="text-slate-400 text-sm font-medium tracking-wide flex items-center gap-2">
                            <Calendar className="w-4 h-4" /> 6-Month Spend
                        </p>
                        <h3 className="text-[2.5rem] font-bold mt-1 tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            ₹{totalSpend.toLocaleString()}
                        </h3>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${isSpendingUp ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {isSpendingUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {trendPercentage}% vs last month
                        </div>
                        <span className="text-xs font-medium text-slate-500">Based on your activity</span>
                    </div>
                </div>
            </section>

            {/* Chart Section */}
            <section className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Spending Flow</h3>
                        <p className="text-xs text-slate-500 font-medium mt-1">Monthly breakdown</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Activity className="w-5 h-5" />
                    </div>
                </div>

                <div className="h-48 flex items-end justify-between gap-2">
                    {months.map((month, idx) => {
                        const val = animatedData[idx] || 0;
                        const heightPercent = maxVal > 0 ? (val / maxVal) * 100 : 0;
                        const isCurrentMonth = idx === months.length - 1;

                        return (
                            <div key={month} className="flex flex-col items-center gap-3 flex-1 group">
                                <div className="w-full flex justify-center relative">
                                    <div className="absolute -top-8 bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                                        ₹{val.toLocaleString()}
                                    </div>
                                    <div className="w-full max-w-[40px] h-36 bg-slate-100 dark:bg-slate-800/50 rounded-t-xl overflow-hidden flex items-end justify-center">
                                        <div
                                            className={`w-full rounded-t-xl transition-all duration-1000 ease-out ${isCurrentMonth ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-slate-300 dark:bg-slate-600'}`}
                                            style={{ height: `${heightPercent}%` }}
                                        />
                                    </div>
                                </div>
                                <span className={`text-xs font-semibold ${isCurrentMonth ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                    {month}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Summary Blocks */}
            <section className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-5 rounded-[22px] border border-indigo-100 dark:border-indigo-800/30">
                    <div className="w-8 h-8 rounded-full bg-indigo-200/50 dark:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center mb-3">
                        <DollarSign className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-semibold text-indigo-900/60 dark:text-indigo-200/60 uppercase tracking-widest mb-1">Avg Spend</p>
                    <h4 className="text-xl font-bold text-indigo-900 dark:text-indigo-100">₹{averageSpend.toLocaleString()}</h4>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-5 rounded-[22px] border border-emerald-100 dark:border-emerald-800/30">
                    <div className="w-8 h-8 rounded-full bg-emerald-200/50 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mb-3">
                        <Activity className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-semibold text-emerald-900/60 dark:text-emerald-200/60 uppercase tracking-widest mb-1">Transactions</p>
                    <h4 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">{Math.floor(totalSpend / 450)}</h4>
                </div>
            </section>

            {/* --- Voice Assistant Section --- */}
            <section className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-8 rounded-[28px] border-2 border-blue-200 dark:border-blue-800/50 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <div className="w-10 h-10 bg-blue-500/20 dark:bg-blue-500/30 rounded-full flex items-center justify-center">
                                <Mic className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            AI Financial Assistant
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Ask me anything about your spending patterns</p>
                    </div>
                </div>

                {/* Example Queries */}
                <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-800/50 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">💡 Try asking:</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200">"How much did I spend in January?"</p>
                    </div>
                    <div className="bg-white dark:bg-slate-800/50 p-3 rounded-lg border border-blue-100 dark:border-blue-800/30">
                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">💡 Try asking:</p>
                        <p className="text-sm text-slate-700 dark:text-slate-200">"What's my highest spending month?"</p>
                    </div>
                </div>

                {/* User Query Display */}
                {userQuery && (
                    <div className="mb-6 p-4 bg-blue-100 dark:bg-blue-900/40 rounded-lg border-l-4 border-blue-500">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">Your Question</p>
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">{userQuery}</p>
                    </div>
                )}

                {/* Processing State */}
                {isTranscribing && (
                    <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                        <div>
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">Processing</p>
                            <p className="text-sm text-slate-700 dark:text-slate-300">Analyzing your transactions...</p>
                        </div>
                    </div>
                )}

                {/* Assistant Answer Display */}
                {assistantAnswer && (
                    <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-emerald-200 dark:bg-emerald-800/50 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                <MessageSquare className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wide mb-1">Assistant Response</p>
                                <p className="text-sm text-emerald-900 dark:text-emerald-100 leading-relaxed font-medium">{assistantAnswer}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Voice Control Button - Prominent Position */}
                <div className="flex items-center gap-4">
                    <button
                        onMouseDown={handleStartVoice}
                        onMouseUp={handleStopVoice}
                        onTouchStart={handleStartVoice}
                        onTouchEnd={handleStopVoice}
                        className={`flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold transition-all duration-300 
                            ${(isListening || isTranscribing) 
                                ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 scale-105 animate-pulse' 
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105'
                            }
                        `}
                    >
                        {isTranscribing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Processing...</span>
                            </>
                        ) : isListening ? (
                            <>
                                <Mic className="w-5 h-5" />
                                <span>Release to Send</span>
                            </>
                        ) : (
                            <>
                                <Mic className="w-5 h-5" />
                                <span>Hold & Speak</span>
                            </>
                        )}
                    </button>
                    
                    {/* Close Button */}
                    {(assistantAnswer || userQuery) && (
                        <button
                            onClick={closeAssistant}
                            className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-all duration-300"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </section>
        </div>
    );
}
