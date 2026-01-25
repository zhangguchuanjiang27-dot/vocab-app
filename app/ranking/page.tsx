"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type RankingUser = {
    id: string;
    name: string;
    image: string | null;
    count: number;
};

type Period = 'lifetime' | 'yearly' | 'monthly' | 'weekly';

export default function RankingPage() {
    const { data: session } = useSession();
    const [period, setPeriod] = useState<Period>('lifetime');
    const [rankings, setRankings] = useState<RankingUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRanking = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/ranking?period=${period}`);
                if (res.ok) {
                    const data = await res.json();
                    setRankings(data);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchRanking();
    }, [period]);

    const getPeriodLabel = (p: Period) => {
        switch (p) {
            case 'lifetime': return '全期間';
            case 'yearly': return '年間';
            case 'monthly': return '月間';
            case 'weekly': return '週間';
        }
    };

    const getMedal = (rank: number) => {
        if (rank === 1) return <span className="text-3xl">🥇</span>;
        if (rank === 2) return <span className="text-3xl">🥈</span>;
        if (rank === 3) return <span className="text-3xl">🥉</span>;
        return <span className="text-xl font-bold font-mono text-neutral-400 w-8 text-center">{rank}</span>;
    };

    const myRank = rankings.findIndex(u => u.id === session?.user?.id) + 1;

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-black p-6 sm:p-12 font-sans">
            <div className="max-w-2xl mx-auto">
                <header className="mb-8 text-center">
                    <Link href="/" className="text-sm font-bold text-neutral-500 hover:text-indigo-500 mb-6 inline-block">
                        ← Back to Home
                    </Link>
                    <h1 className="text-3xl font-black mb-2 flex items-center justify-center gap-2">
                        <span className="text-4xl">👑</span>
                        <span>Word Master Ranking</span>
                    </h1>
                    <p className="text-neutral-500 text-sm">
                        生成・登録した単語数のランキングです。
                    </p>
                </header>

                {/* Tabs */}
                <div className="flex p-1 bg-neutral-200 dark:bg-neutral-900 rounded-xl mb-8">
                    {(['weekly', 'monthly', 'yearly', 'lifetime'] as Period[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${period === p
                                ? "bg-white dark:bg-neutral-800 text-black dark:text-white shadow-sm"
                                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                                }`}
                        >
                            {getPeriodLabel(p)}
                        </button>
                    ))}
                </div>

                {/* My Rank Banner */}
                {session && !loading && (
                    <div className="mb-8 bg-indigo-600 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-indigo-500/30">
                        <div className="flex items-center gap-4">
                            <div className="ml-2 font-bold text-indigo-200 text-sm uppercase tracking-wider">Your Rank</div>
                            {myRank > 0 ? (
                                <div className="text-2xl font-black">
                                    {myRank}<span className="text-sm font-normal opacity-70 ml-1">位</span>
                                </div>
                            ) : (
                                <div className="text-sm opacity-80">ランク外 (0語)</div>
                            )}
                        </div>
                        <div className="text-right">
                            {myRank > 0 && (
                                <div className="font-mono font-bold text-xl">
                                    {rankings[myRank - 1]?.count.toLocaleString()} <span className="text-xs font-sans font-normal opacity-70">words</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Ranking List */}
                <div className="bg-white dark:bg-neutral-900 rounded-3xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                    {loading ? (
                        <div className="p-12 text-center text-neutral-400">
                            Loading ranking...
                        </div>
                    ) : rankings.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400">
                            データがありません
                        </div>
                    ) : (
                        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {rankings.map((user, index) => {
                                const rank = index + 1;
                                const isMe = session?.user?.id === user.id;

                                return (
                                    <div key={user.id} className={`flex items-center gap-4 p-4 ${isMe ? "bg-indigo-50 dark:bg-indigo-900/10" : ""}`}>
                                        <div className="w-12 flex justify-center items-center shrink-0">
                                            {getMedal(rank)}
                                        </div>

                                        <div className="shrink-0">
                                            {user.image ? (
                                                <img src={user.image} alt={user.name} className="w-10 h-10 rounded-full border border-neutral-200 dark:border-neutral-800" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-lg">👤</div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className={`font-bold truncate ${isMe ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                                                {user.name || "Unknown"} {isMe && "(You)"}
                                            </div>
                                        </div>

                                        <div className="text-right shrink-0">
                                            <div className="font-mono font-bold text-lg">
                                                {user.count.toLocaleString()}
                                            </div>
                                            <div className="text-[10px] text-neutral-400 uppercase font-bold">words</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
