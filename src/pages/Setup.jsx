import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Mic, Camera, Users, CheckCircle } from 'lucide-react';

export default function Setup() {
    const { user } = useAuth();

    return (
        <div className="p-6 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
            <header className="mb-2">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Security & Biometrics</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed">
                    Manage your active authentication methods. Since you have already enrolled, your biometric embeddings are securely stored in the database.
                </p>
            </header>

            <div className="flex flex-col gap-4 relative">
                <div className="flex items-center p-5 rounded-[24px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
                    <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center mr-5 shrink-0">
                        <Mic className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            Voiceprint Active
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                        </h3>
                        <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400 font-medium line-clamp-1">
                            Whisper AI Embedding Confirmed
                        </p>
                    </div>
                </div>

                <div className="flex items-center p-5 rounded-[24px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
                    <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 flex items-center justify-center mr-5 shrink-0">
                        <Camera className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            Face Model Active
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                        </h3>
                        <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400 font-medium line-clamp-1">
                            InsightFace Embedding Confirmed
                        </p>
                    </div>
                </div>

                <div className="flex items-center p-5 rounded-[24px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center mr-5 shrink-0">
                        <Users className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            Contacts Synced
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                        </h3>
                        <p className="text-[11px] mt-1 text-slate-500 dark:text-slate-400 font-medium line-clamp-1">
                            Address Book Matching Enabled
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-4 p-5 rounded-[24px] bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Account File</h3>
                <div className="mt-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Name</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{user?.name || 'Authorized User'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Email</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{user?.email || 'user@example.com'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Security Clearance</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md text-[11px]">Level 2 (Biometric)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
