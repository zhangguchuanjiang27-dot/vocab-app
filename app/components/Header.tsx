"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Session } from "next-auth"; // Should import Type not value? Actually Session is type usually.

type HeaderProps = {
    initialCredits: number;
    session: Session | null;
    plan?: string | null;
    subscriptionPeriodEnd?: string | null;
    role?: string;
};

export default function Header({ initialCredits, session, plan, subscriptionPeriodEnd, role }: HeaderProps) {
    const [streak, setStreak] = useState<number | null>(null);
    const [streakUpdated, setStreakUpdated] = useState(false);

    useEffect(() => {
        if (session?.user) {
            fetch("/api/user/streak")
                .then(res => res.json())
                .then(data => {
                    if (data.streak !== undefined) {
                        setStreak(data.streak);
                        if (data.updated) {
                            setStreakUpdated(true);
                            setTimeout(() => setStreakUpdated(false), 5000);
                        }
                    }
                })
                .catch(console.error);
        }
    }, [session]);

    // Calculate remaining days
    const getDaysRemaining = () => {
        if (!subscriptionPeriodEnd) return null;
        const end = new Date(subscriptionPeriodEnd);
        const now = new Date();
        const diff = end.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 0;
    };

    const daysRemaining = getDaysRemaining();

    return (
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-6">
                <Link href="/" className="font-black text-xl tracking-tight flex items-center gap-2">
                    <span className="text-2xl">⚡️</span>
                    <span>Voca</span>
                </Link>

                {session && (
                    <Link href="/ranking" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors text-sm font-bold text-neutral-600 dark:text-neutral-400 group">
                        <span className="group-hover:scale-110 transition-transform">👑</span>
                        <span>Ranking</span>
                    </Link>
                )}
                {session && role === 'admin' && (
                    <Link href="/admin" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors text-sm font-bold text-neutral-600 dark:text-neutral-400 group">
                        <span>📊</span>
                        <span>Admin</span>
                    </Link>
                )}
            </div>

            <div className="flex items-center gap-6">
                {session ? (
                    <>
                        {/* Streak Badge */}
                        {streak !== null && (
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400 font-bold font-mono text-sm transition-all ${streakUpdated ? 'scale-110 shadow-orange-500/50 shadow-lg' : ''}`} title="連続ログイン日数">
                                <span className={streakUpdated ? "animate-bounce" : ""}>🔥</span>
                                <span>
                                    {streak}
                                    <span className="ml-1 text-[10px] uppercase opacity-80">Day{streak !== 1 ? 's' : ''}</span>
                                </span>
                            </div>
                        )}

                        {/* Plan Badge */}
                        <div className={`
                            hidden sm:flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-black tracking-widest uppercase
                            ${plan === 'pro'
                                ? 'bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30'
                                : plan === 'basic'
                                    ? 'bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                                    : 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700'
                            }
                        `}>
                            {plan || 'FREE'}
                        </div>

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900 rounded-full border border-neutral-200 dark:border-neutral-800 relative group/wallet">
                            <span className="text-lg">🪙</span>
                            <span className="font-bold font-mono text-sm">
                                {plan === 'unlimited' ? "無制限" : initialCredits}
                            </span>

                            {/* Days Remaining Tooltip/Badge */}
                            {plan && daysRemaining !== null && (
                                <div className="ml-1 px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-800 rounded text-[9px] font-bold text-neutral-500 dark:text-neutral-400 flex items-center gap-1 group-hover/wallet:scale-105 transition-transform">
                                    <span className="opacity-70">あと</span>
                                    <span className={`${daysRemaining <= 3 ? 'text-red-500 animate-pulse' : ''}`}>{daysRemaining}日</span>
                                </div>
                            )}

                            <Link href="/checkout" className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold hover:bg-indigo-500 transition-colors ml-1">
                                追加
                            </Link>
                        </div>
                        <div className="flex items-center gap-3 pl-3 border-l border-neutral-200 dark:border-neutral-800">
                            {session.user?.image && (
                                <Link href="/profile">
                                    <img src={session.user.image} alt="User" className="w-8 h-8 rounded-full border border-neutral-200 dark:border-neutral-800 hover:scale-110 transition-transform" />
                                </Link>
                            )}
                            <Link href="/api/auth/signout" className="text-xs font-bold text-neutral-500 hover:text-black dark:hover:text-white">
                                ログアウト
                            </Link>
                        </div>
                    </>
                ) : (
                    <Link href="/api/auth/signin" className="text-sm font-bold bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-full hover:opacity-80 transition-opacity">
                        ログイン
                    </Link>
                )}
            </div>
        </div>
    );
}
