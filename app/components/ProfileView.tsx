"use client";

import { useState } from "react";
import { getLevelInfo } from "@/lib/gamification";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ProfileViewProps = {
    user: any;
    allBadges: any[];
};

export default function ProfileView({ user, allBadges }: ProfileViewProps) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(user.name || "");
    const [image, setImage] = useState(user.image || "");
    const [isPublicRanking, setIsPublicRanking] = useState(user.isPublicRanking || false);
    const [loading, setLoading] = useState(false);

    // Calculate Level
    const { level } = getLevelInfo(user.xp || 0);

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
                setIsEditing(false);
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

    return (
        <div className="min-h-screen bg-[#050505] text-neutral-100 p-4 sm:p-12 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="mb-12">
                    <div className="flex flex-row items-center gap-4 sm:gap-8 bg-neutral-900 p-5 sm:p-8 rounded-3xl border border-neutral-800 shadow-sm relative overflow-hidden">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        {/* Avatar */}
                        <div className="relative shrink-0">
                            {image ? (
                                <img src={image} alt={name || "User"} className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-4 border-neutral-800 shadow-lg object-cover" />
                            ) : (
                                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-indigo-900 border-4 border-neutral-800 shadow-lg flex items-center justify-center text-2xl sm:text-4xl">
                                    👤
                                </div>
                            )}
                            <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white text-xs font-black px-3 py-1 rounded-full border-2 border-neutral-800 flex items-center gap-1">
                                <span>⭐</span>
                                <span>{level}</span>
                            </div>
                        </div>

                        {/* Info */}
                        <div className="text-left flex-1 min-w-0 z-10">
                            {isEditing ? (
                                <div className="space-y-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">ユーザー名</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full px-4 py-2 rounded-xl border border-neutral-800 bg-black text-lg font-bold"
                                            placeholder="ニックネームを入力"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">プロフィール画像</label>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <label className="cursor-pointer px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-bold text-neutral-300 transition-colors flex items-center gap-2">
                                                    <span>📁 ファイルを選択</span>
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
                                                <span className="text-[10px] text-neutral-400">Max 2MB</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-4 bg-indigo-950/30 rounded-2xl border border-indigo-900/50">
                                        <div className="pt-0.5">
                                            <input
                                                type="checkbox"
                                                id="isPublicRanking"
                                                checked={isPublicRanking}
                                                onChange={(e) => setIsPublicRanking(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                            />
                                        </div>
                                        <label htmlFor="isPublicRanking" className="text-sm cursor-pointer">
                                            <span className="block font-bold text-indigo-300">公開ランキングに参加する</span>
                                            <span className="block text-xs text-indigo-400/70 mt-0.5">
                                                チェックを入れると、あなたのユーザー名、アイコン、獲得単語数がランキングに表示されます。
                                            </span>
                                        </label>
                                    </div>
                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={handleSave}
                                            disabled={loading}
                                            className="flex-1 sm:flex-none px-4 sm:px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50 whitespace-nowrap"
                                        >
                                            {loading ? "保存中..." : "変更を保存"}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setName(user.name || "");
                                                setImage(user.image || "");
                                            }}
                                            className="flex-1 sm:flex-none px-4 sm:px-6 py-2 bg-neutral-800 text-neutral-400 rounded-xl font-bold whitespace-nowrap"
                                        >
                                            キャンセル
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-start gap-4 mb-1 sm:mb-2">
                                        <h1 className="text-xl sm:text-3xl font-black text-white truncate">{user.name}</h1>

                                        {/* Plan Badge */}
                                        <div className={`
                                            px-3 py-1 rounded-full border text-xs font-black tracking-widest uppercase
                                            ${user.subscriptionPlan === 'pro'
                                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                                : user.subscriptionPlan === 'basic'
                                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                    : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                                            }
                                        `}>
                                            {user.subscriptionPlan || 'FREE'}
                                        </div>

                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="text-neutral-400 hover:text-indigo-500 transition-colors"
                                            title="プロフィールを編集"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                            </svg>
                                        </button>
                                    </div>
                                    <p className="text-neutral-400 font-medium mb-3 sm:mb-4 text-xs sm:text-sm">{user.email}</p>
                                    {user.stripeCustomerId && (
                                        <button
                                            onClick={() => handleSubscription(user.subscriptionPlan === 'pro' ? 'basic' : 'pro')}
                                            className="text-xs font-bold text-indigo-500 hover:text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg mb-4 flex items-center gap-2 transition-all"
                                        >
                                            <span>⚙️</span> プラン管理 / アップグレード
                                        </button>
                                    )}

                                    <div className="flex items-center gap-2 mt-2 mb-6">
                                        {user.isPublicRanking ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/30 text-emerald-400 text-[10px] font-bold">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                ランキング公開中
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-800 text-neutral-400 text-[10px] font-bold">
                                                🔒 ランキング非公開
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-4 w-full">
                                {/* XP Card */}
                                <div className="bg-neutral-800/50 p-3 sm:p-4 rounded-2xl border border-neutral-800 flex flex-col items-center justify-center gap-1">
                                    <div className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">合計 XP</div>
                                    <div className="text-base sm:text-2xl font-black font-mono text-indigo-400">{user.xp?.toLocaleString()}</div>
                                </div>

                                {/* Coins Card */}
                                <div className="relative bg-neutral-800/50 p-3 sm:p-4 rounded-2xl border border-neutral-800 hover:border-emerald-500/30 transition-colors flex flex-col items-center justify-center gap-1">
                                    <div className="flex items-center gap-2">
                                        <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">コイン</div>
                                    </div>

                                    <div className="text-base sm:text-2xl font-black font-mono text-emerald-400">
                                        {user.subscriptionPlan === 'unlimited' ? "∞" : user.credits.toLocaleString()}
                                    </div>

                                    {/* Subscription Badge */}
                                    {user.subscriptionPeriodEnd && (
                                        <div className="absolute top-2 right-2">
                                            <div className="text-[9px] font-bold text-neutral-300 bg-neutral-700 px-1.5 py-0.5 rounded-md shadow-sm border border-neutral-600">
                                                あと{Math.ceil((new Date(user.subscriptionPeriodEnd).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}日
                                            </div>
                                        </div>
                                    )}

                                    {user.subscriptionPeriodEnd && (
                                        <div className="text-[8px] text-neutral-400 mt-0.5">
                                            {new Date(user.subscriptionPeriodEnd).toLocaleDateString()} 更新
                                        </div>
                                    )}
                                </div>

                                {/* Decks Card */}
                                <div className="bg-neutral-800/50 p-3 sm:p-4 rounded-2xl border border-neutral-800 flex flex-col items-center justify-center gap-1">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">単語帳</div>
                                    <div className="text-base sm:text-2xl font-black font-mono text-amber-400">{user._count.decks}</div>
                                </div>
                            </div>


                        </div>
                    </div>
                </header>

                <main>
                    <div className="flex items-end justify-between mb-8">
                        <h2 className="text-2xl font-bold text-white">バッジコレクション</h2>
                        <div className="text-sm font-bold text-neutral-400">{user.badges.length} / {allBadges.length} 獲得済み</div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {allBadges.map((badge: any) => {
                            const isUnlocked = earnedBadgeIds.has(badge.id);
                            return (
                                <div
                                    key={badge.id}
                                    className={`
                                        relative group p-6 rounded-2xl border transition-all duration-300
                                        ${isUnlocked
                                            ? "bg-neutral-900 border-neutral-800 hover:border-indigo-500 shadow-xl shadow-black/50 hover:-translate-y-1"
                                            : "bg-neutral-900/30 border-neutral-900 grayscale opacity-40"
                                        }
                                    `}
                                >
                                    <div className={`text-4xl mb-4 text-center transition-transform duration-300 ${isUnlocked ? "group-hover:scale-110" : ""}`}>
                                        {badge.icon}
                                    </div>
                                    <div className="text-center">
                                        <h3 className={`font-bold text-sm mb-1 ${isUnlocked ? "text-white" : "text-neutral-500"}`}>
                                            {badge.displayName}
                                        </h3>
                                        <p className="text-[10px] text-neutral-400 leading-tight">
                                            {badge.description}
                                        </p>
                                        {!isUnlocked && (
                                            <div className="mt-2 text-[10px] font-bold text-neutral-300 uppercase tracking-wider flex items-center justify-center gap-1">
                                                <span>🔒</span> 未獲得
                                            </div>
                                        )}
                                    </div>
                                    {isUnlocked && (
                                        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div >
        </div >
    );
}
