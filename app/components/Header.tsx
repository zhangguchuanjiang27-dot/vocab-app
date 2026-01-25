"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Session } from "next-auth"; // Should import Type not value? Actually Session is type usually.

type HeaderProps = {
    initialCredits: number;
    session: Session | null;
};

export default function Header({ initialCredits, session }: HeaderProps) {
    const [streak, setStreak] = useState<number | null>(null);
    const [streakUpdated, setStreakUpdated] = useState(false);

    useEffect(() => {
        /*
        if (session?.user) {
            fetch("/api/user/streak")
                .then(res => res.json())
                .then(data => {
                    if (data.streak !== undefined) {
                        setStreak(data.streak);
                        if (data.updated) {
                            setStreakUpdated(true);
                            // Simple toast or effect could trigger here
                            setTimeout(() => setStreakUpdated(false), 5000);
                        }
                    }
                })
                .catch(console.error);
        }
        */
    }, [session]);

    return (
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" className="font-black text-xl tracking-tight flex items-center gap-2">
                <span className="text-2xl">⚡️</span>
                <span>Voca</span>
            </Link>

            <div className="flex items-center gap-6">
                {session ? (
                    <>
                        {/* Streak Badge */}
                        {streak !== null && (
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400 font-bold font-mono text-sm transition-all ${streakUpdated ? 'scale-110 shadow-orange-500/50 shadow-lg' : ''}`} title="連続ログイン日数">
                                <span className={streakUpdated ? "animate-bounce" : ""}>🔥</span>
                                <span>{streak}</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900 rounded-full border border-neutral-200 dark:border-neutral-800">
                            <span className="text-lg">🪙</span>
                            <span className="font-bold font-mono text-sm">{initialCredits}</span>
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
