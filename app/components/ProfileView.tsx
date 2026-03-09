"use client";

import { useState, useRef, useEffect } from "react";
import { getLevelInfo } from "@/lib/gamification";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Utility for class name merging (can be replaced by clsx/tailwind-merge if in project, keeping it simple here)
const cx = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(" ");

type ProfileViewProps = {
    user: any;
    allBadges: any[];
};

export default function ProfileView({ user, allBadges }: ProfileViewProps) {
    const router = useRouter();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Edit Form State
    const [name, setName] = useState(user.name || "");
    const [image, setImage] = useState(user.image || "");
    const [isPublicRanking, setIsPublicRanking] = useState(user.isPublicRanking || false);
    const [loading, setLoading] = useState(false);

    // Calculate Level
    const { level, xpInCurrentLevel, xpRequiredForNext, progress } = getLevelInfo(user.xp || 0);

    // Get earned badge IDs
    const earnedBadgeIds = new Set(user.badges.map((ub: any) => ub.badgeId));

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, image, isPublicRanking }),
            });

            if (res.ok) {
                setIsEditModalOpen(false);
                router.refresh();
            } else {
                alert("更新に失敗しました。");
            }
        } catch (error) {
            console.error(error);
            alert("エラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    const handleSubscription = async (plan: 'basic' | 'pro') => {
        setLoading(true);
        try {
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan }),
            });

            if (!res.ok) {
                const error = await res.json();
                alert(error.error || "エラーが発生しました");
                setLoading(false);
                return;
            }

            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            console.error(error);
            alert("通信エラーが発生しました");
            setLoading(false);
        }
    };

    const isUnlimited = user.subscriptionPlan === 'unlimited';

    return (
        <div className="min-h-screen bg-[#050505] text-neutral-100 p-4 sm:p-8 font-sans pb-24 relative">
            {/* Background Base Effects */}
            <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.03)_0%,transparent_50%)] pointer-events-none"></div>

            <div className="max-w-4xl mx-auto relative z-10">
                {/* --- HEADER (HERO SECTION) --- */}
                <header className="mb-12 relative">
                    <div className="bg-neutral-900/40 backdrop-blur-xl p-8 sm:p-12 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
                        {/* Decorative Background Gradients within Header */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-48 bg-gradient-to-b from-indigo-500/10 to-transparent opacity-60"></div>
                        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-purple-500/20 rounded-full blur-[80px]"></div>
                        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]"></div>

                        {/* Avatar & Level Badge */}
                        <div className="relative mb-6 group">
                            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-900 shadow-xl mx-auto">
                                <div className="w-full h-full rounded-full bg-black overflow-hidden flex items-center justify-center relative">
                                    {image ? (
                                        <img src={image} alt={user.name || "User"} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                    ) : (
                                        <div className="text-5xl">👤</div>
                                    )}
                                    {/* Subtle inner reflection */}
                                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none rounded-full"></div>
                                </div>
                            </div>

                            {/* Level Indicator Floating Badge */}
                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-neutral-900/90 backdrop-blur-md rounded-full border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center gap-1.5">
                                <span className="text-sm">⭐</span>
                                <span className="text-xs font-black text-white tracking-widest uppercase">Lv.{level}</span>
                            </div>
                        </div>

                        {/* User Info */}
                        <div className="relative z-10 space-y-3 px-4">
                            <div className="flex items-center justify-center gap-3 flex-wrap">
                                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">{user.name}</h1>

                                {/* Edit Button */}
                                <button
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="p-2 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-full transition-all border border-transparent hover:border-white/10"
                                    title="プロフィールを編集"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                    </svg>
                                </button>
                            </div>

                            <p className="text-neutral-400 text-sm font-medium">{user.email}</p>

                            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                                {/* Plan Badge */}
                                <div className={cx(
                                    "px-4 py-1.5 rounded-full border text-xs font-black tracking-widest uppercase shadow-sm",
                                    user.subscriptionPlan === 'pro'
                                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 shadow-indigo-500/10'
                                        : user.subscriptionPlan === 'basic'
                                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 shadow-emerald-500/10'
                                            : 'bg-neutral-800/50 text-neutral-400 border-white/5'
                                )}>
                                    {user.subscriptionPlan || 'FREE PLAN'}
                                </div>

                                {/* Ranking Status */}
                                {user.isPublicRanking ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 text-xs font-bold shadow-sm shadow-emerald-900/10">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        ランキング公開中
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-800/50 border border-white/5 text-neutral-400 text-xs font-bold shadow-sm">
                                        🔒 ランキング非公開
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                {/* --- STATS DASHBOARD --- */}
                <section className="mb-16">
                    <h2 className="text-xl font-bold text-white mb-6 px-2 flex items-center gap-2">
                        <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        学習ステータス
                    </h2>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {/* XP Card */}
                        <div className="group bg-neutral-900/40 backdrop-blur-sm p-4 sm:p-6 rounded-3xl border border-white/5 hover:border-indigo-500/30 transition-all hover:-translate-y-1 relative overflow-hidden flex flex-col min-h-[160px]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-indigo-500/20 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full flex-1">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                        Total XP
                                    </div>
                                    <span className="text-lg">✨</span>
                                </div>
                                <div className="mt-auto flex flex-col flex-1 justify-end">
                                    <div className="text-3xl sm:text-4xl font-black font-mono text-white mb-1 tracking-tight flex items-baseline">
                                        {user.xp?.toLocaleString()}
                                    </div>
                                    <div>
                                        <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden border border-white/5">
                                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progress}%` }}></div>
                                        </div>
                                        <div className="flex justify-between mt-1 text-[8px] sm:text-[10px] text-neutral-500 font-mono">
                                            <span>{xpInCurrentLevel} XP</span>
                                            <span>{xpRequiredForNext} XP</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Streak Card */}
                        <div className="group bg-neutral-900/40 backdrop-blur-sm p-4 sm:p-6 rounded-3xl border border-white/5 hover:border-orange-500/30 transition-all hover:-translate-y-1 relative overflow-hidden flex flex-col min-h-[160px]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-orange-500/20 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full flex-1">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                        Streak
                                    </div>
                                    <span className="text-lg">🔥</span>
                                </div>
                                <div className="mt-auto flex flex-col flex-1 justify-end">
                                    <div className="text-3xl sm:text-4xl font-black font-mono text-orange-400 tracking-tight flex items-baseline gap-1">
                                        {user.loginStreak || 0}
                                        <span className="text-[10px] sm:text-xs text-neutral-500 font-sans font-medium uppercase">Days</span>
                                    </div>
                                    <div className="mt-2 text-[10px] sm:text-xs text-neutral-500 font-medium">
                                        継続は力なり！
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Coins Card */}
                        <div className="group bg-neutral-900/40 backdrop-blur-sm p-4 sm:p-6 rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all hover:-translate-y-1 relative overflow-hidden flex flex-col min-h-[160px]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/20 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full flex-1">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        Coins
                                    </div>
                                    <span className="text-lg">🪙</span>
                                </div>
                                <div className="mt-auto flex flex-col flex-1 justify-end">
                                    <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 tracking-tight flex items-baseline gap-1">
                                        {isUnlimited ? "∞" : user.credits.toLocaleString()}
                                    </div>
                                    <div className="mt-2 text-[10px] sm:text-xs text-neutral-500 font-medium truncate">
                                        アイテムや生成に
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Decks Card */}
                        <div className="group bg-neutral-900/40 backdrop-blur-sm p-4 sm:p-6 rounded-3xl border border-white/5 hover:border-amber-500/30 transition-all hover:-translate-y-1 relative overflow-hidden flex flex-col min-h-[160px]">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/20 transition-all"></div>
                            <div className="relative z-10 flex flex-col h-full flex-1">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                        Decks
                                    </div>
                                    <span className="text-lg">📚</span>
                                </div>
                                <div className="mt-auto flex flex-col flex-1 justify-end">
                                    <div className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight flex items-baseline">
                                        {user._count.decks}
                                    </div>
                                    <div className="mt-1">
                                        <Link href="/#saved" className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors">
                                            一覧を見る
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" /></svg>
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- BADGE COLLECTION --- */}
                <section>
                    <div className="flex items-center justify-between mb-6 px-2">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                            バッジコレクション
                        </h2>
                        <div className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-xs font-bold text-neutral-300">
                            <span className="text-white">{user.badges.length}</span> / {allBadges.length} 獲得
                        </div>
                    </div>

                    {allBadges.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {allBadges.map((badge: any) => {
                                const isUnlocked = earnedBadgeIds.has(badge.id);
                                return (
                                    <div
                                        key={badge.id}
                                        className={cx(
                                            "relative group p-6 rounded-3xl border transition-all duration-500",
                                            isUnlocked
                                                ? "bg-neutral-900/60 border-white/10 hover:border-purple-500/50 hover:bg-neutral-900/80 hover:-translate-y-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)] cursor-default"
                                                : "bg-black/50 border-white/5 opacity-50 backdrop-blur-sm grayscale-[0.8]"
                                        )}
                                    >
                                        {/* Unlocked background glow */}
                                        {isUnlocked && (
                                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"></div>
                                        )}

                                        <div className="relative z-10 flex flex-col items-center text-center">
                                            <div className={cx(
                                                "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 transition-transform duration-500 backdrop-blur-md shadow-inner",
                                                isUnlocked ? "bg-white/5 group-hover:scale-110 group-hover:rotate-3 border border-white/10" : "bg-white/5 border border-white/5"
                                            )}>
                                                {isUnlocked ? badge.icon : <span className="text-neutral-600 opacity-50">{badge.icon}</span>}
                                            </div>

                                            <h3 className={cx(
                                                "font-bold text-sm mb-1.5",
                                                isUnlocked ? "text-white" : "text-neutral-500"
                                            )}>
                                                {badge.displayName}
                                            </h3>

                                            <p className="text-[10px] text-neutral-400 leading-relaxed font-medium">
                                                {isUnlocked ? badge.description : "条件を満たしていません"}
                                            </p>
                                        </div>

                                        {/* Locked overlay lock icon */}
                                        {!isUnlocked && (
                                            <div className="absolute top-4 right-4 text-neutral-600/50">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        )}

                                        {/* Earned tag indicator */}
                                        {isUnlocked && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)] border-2 border-[#111]"></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="bg-neutral-900/30 border border-white/5 rounded-3xl p-12 text-center">
                            <span className="text-4xl mb-4 block opacity-50 text-neutral-500">🏆</span>
                            <p className="text-neutral-400 font-bold mb-1">バッジがまだありません</p>
                            <p className="text-xs text-neutral-500">学習を進めてバッジを獲得しましょう</p>
                        </div>
                    )}
                </section>
            </div>

            {/* --- EDIT PROFILE MODAL --- */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}></div>

                    <div className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl shadow-2xl p-6 sm:p-8 animate-in fade-in slide-in-from-bottom-8 duration-300">
                        <button
                            onClick={() => setIsEditModalOpen(false)}
                            className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                        </button>

                        <h3 className="text-xl font-bold text-white mb-6">プロフィール編集</h3>

                        <div className="space-y-6">
                            {/* Avatar Edit */}
                            <div className="flex flex-col items-center">
                                <div className="relative w-20 h-20 rounded-full overflow-hidden bg-black border-2 border-white/10 mb-3 group">
                                    {image ? (
                                        <img src={image} alt="Avatar Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>
                                    )}
                                    <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-white"><path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a2.25 2.25 0 00-3.182 0l-1.44 1.439-2.028-2.029a2.25 2.25 0 00-3.182 0l-3.94 3.94-.008-.008z" clipRule="evenodd" /></svg>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    if (file.size > 2 * 1024 * 1024) {
                                                        alert("画像サイズは2MB以下にしてください");
                                                        return;
                                                    }
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setImage(reader.result as string);
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                                <span className="text-[10px] text-neutral-500">クリックして変更 (Max 2MB)</span>
                            </div>

                            {/* Name Input */}
                            <div>
                                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">ユーザー名</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-white/10 bg-black/50 text-white font-bold focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                    placeholder="ニックネームを入力"
                                    maxLength={20}
                                />
                            </div>

                            {/* Ranking Toggle */}
                            <label className="flex items-start gap-3 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/20 cursor-pointer group hover:bg-indigo-500/10 transition-colors cursor-pointer">
                                <div className="pt-0.5 shrink-0">
                                    <input
                                        type="checkbox"
                                        checked={isPublicRanking}
                                        onChange={(e) => setIsPublicRanking(e.target.checked)}
                                        className="w-5 h-5 text-indigo-600 bg-black border-white/20 rounded focus:ring-indigo-500 focus:ring-offset-black accent-indigo-500 cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <span className="block font-bold text-indigo-300 group-hover:text-indigo-200 transition-colors">公開ランキングに参加</span>
                                    <span className="block text-xs text-indigo-400/60 mt-1 leading-relaxed">
                                        チェックを入れると、ランキングページにあなたのユーザー名・アイコン・実績が掲載されます。
                                    </span>
                                </div>
                            </label>

                            {/* Actions */}
                            <div className="pt-2 flex gap-3 w-full">
                                <button
                                    onClick={() => {
                                        setIsEditModalOpen(false);
                                        // Revert temp state if canceled
                                        setName(user.name || "");
                                        setImage(user.image || "");
                                        setIsPublicRanking(user.isPublicRanking || false);
                                    }}
                                    className="flex-1 px-4 py-3 bg-white/5 text-white hover:bg-white/10 rounded-xl font-bold transition-all text-sm"
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={loading}
                                    className="flex-1 px-4 py-3 bg-indigo-600 text-white hover:bg-indigo-500 rounded-xl font-bold transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>保存中</>
                                    ) : "変更を保存"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
