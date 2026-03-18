import { ArrowRight, Activity, ShieldCheck, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Home() {
    const { user } = useAuth();

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatShortDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
    };

    return (
        <div className="p-6 flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <section className="mt-2">
                <h2 className="text-3xl font-light text-slate-800 dark:text-slate-200 tracking-tight">
                    Hello, <span className="font-semibold text-slate-900 dark:text-white capitalize">{user?.name || 'Guest'}</span>
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">Ready to make a secure voice payment?</p>
            </section>

            {/* Card Balances */}
            <section className="relative p-7 rounded-[28px] bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white overflow-hidden shadow-2xl shadow-blue-600/20 group">
                <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-700">
                    <Wallet className="w-32 h-32" />
                </div>
                <div className="absolute w-full h-full left-0 top-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)] bg-[length:200%_100%] animate-shimmer"></div>

                <div className="relative z-10 flex flex-col h-full justify-between gap-8">
                    <div>
                        <p className="text-blue-100/90 text-sm font-medium tracking-wide">Total Balance</p>
                        <h3 className="text-[2.75rem] font-bold mt-1 tracking-tight leading-none">{formatCurrency(user?.balance)}</h3>
                    </div>
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-blue-100/70 text-xs font-medium tracking-wider uppercase">Linked UPI</p>
                            <p className="font-semibold text-sm mt-1">{user?.name ? `${user.name.toLowerCase().replace(/\\s+/g, '')}@okicici` : 'user@okicici'}</p>
                        </div>
                        <div className="w-12 h-8 rounded-md bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/10">
                            <span className="text-xs font-bold font-mono tracking-widest">UPI</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quick Actions */}
            <section>
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Quick Actions</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Link to="/analytics" className="flex flex-col p-5 rounded-[22px] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300 text-left group">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                            <Activity className="w-6 h-6" />
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Analytics</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-medium">View insights</span>
                    </Link>

                    <Link to="/enroll" className="flex flex-col p-5 rounded-[22px] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-300 text-left group">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">Enrollment</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-medium">Verify phases</span>
                    </Link>
                </div>
            </section>

            {/* Recent Activity */}
            <section className="mb-4">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Recent Activity</h3>
                    <button className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition">See all</button>
                </div>
                <div className="flex flex-col gap-3.5">
                    {(!user?.transactions || user?.transactions.length === 0) ? (
                        <div className="text-center p-8 text-slate-500 text-sm">No recent transactions.</div>
                    ) : (
                        user.transactions.map((item, i) => (
                            <div key={i} className="flex items-center gap-4 p-4 rounded-[20px] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 hover:shadow-md transition duration-300 group cursor-pointer">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${item.type === 'received' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                                    {item.initial || 'TR'}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{item.recipientName || 'Unknown'}</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{formatShortDate(item.date)}</p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className={`font-bold text-sm ${item.type === 'received' ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {item.type === 'received' ? '+' : '-'}{formatCurrency(item.amount)}
                                    </span>
                                    <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-medium">
                                        {item.type === 'received' ? <ArrowDownLeft className="w-3 h-3 text-emerald-500" /> : <ArrowUpRight className="w-3 h-3 text-slate-400" />}
                                        {item.type === 'received' ? 'Received' : 'Sent'}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
