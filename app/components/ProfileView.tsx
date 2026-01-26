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
                body: JSON.stringify({ name, image }),
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
        <div className="min-h-screen bg-neutral-50 dark:bg-black p-6 sm:p-12 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="mb-12">
                    <Link href="/" className="text-sm font-bold text-neutral-500 hover:text-indigo-500 mb-6 inline-block">
                        ← Back to App
                    </Link>

                    <div className="flex flex-col sm:flex-row items-center gap-8 bg-white dark:bg-neutral-900 p-8 rounded-3xl border border-neutral-200 dark:border-neutral-800 shadow-sm relative overflow-hidden">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        {/* Avatar */}
                        <div className="relative shrink-0">
                            {image ? (
                                <img src={image} alt={name || "User"} className="w-24 h-24 rounded-full border-4 border-white dark:border-neutral-800 shadow-lg object-cover" />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-indigo-100 dark:bg-indigo-900 border-4 border-white dark:border-neutral-800 shadow-lg flex items-center justify-center text-4xl">
                                    👤
                                </div>
                            )}
                            <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white text-xs font-black px-3 py-1 rounded-full border-2 border-white dark:border-neutral-800 flex items-center gap-1">
                                <span>⭐</span>
                                <span>{level}</span>
                            </div>
                        </div>

                        {/* Info */}
                        <div className="text-center sm:text-left flex-1 min-w-0 z-10">
                            {isEditing ? (
                                <div className="space-y-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            className="w-full px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-black text-lg font-bold"
                                            placeholder="名前を入力"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Profile Image</label>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <label className="cursor-pointer px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl text-xs font-bold text-neutral-600 dark:text-neutral-300 transition-colors flex items-center gap-2">
                                                    <span>📁 Choose File</span>
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
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSave}
                                            disabled={loading}
                                            className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50"
                                        >
                                            {loading ? "Saving..." : "Save Changes"}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setName(user.name || "");
                                                setImage(user.image || "");
                                            }}
                                            className="px-6 py-2 bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-xl font-bold"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-center sm:justify-start gap-4 mb-1">
                                        <h1 className="text-3xl font-black text-neutral-900 dark:text-white truncate">{user.name}</h1>
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="text-indigo-600 hover:text-indigo-500 text-sm font-bold flex items-center gap-1"
                                        >
                                            <span>✏️</span>
                                            <span>Edit</span>
                                        </button>
                                    </div>
                                    <p className="text-neutral-500 dark:text-neutral-400 font-medium mb-4">{user.email}</p>
                                </>
                            )}

                            {/* Stats */}
                            <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                                <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Total XP</div>
                                    <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">{user.xp?.toLocaleString()}</div>
                                </div>
                                <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Coins</div>
                                    <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{user.credits.toLocaleString()}</div>
                                </div>
                                <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Decks</div>
                                    <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">{user._count.decks}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main>
                    <div className="flex items-end justify-between mb-8">
                        <h2 className="text-2xl font-bold dark:text-white">Badges Collection</h2>
                        <div className="text-sm font-bold text-neutral-400">{user.badges.length} / {allBadges.length} Unlocked</div>
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
                                            ? "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-indigo-300 hover:shadow-lg hover:-translate-y-1"
                                            : "bg-neutral-100 dark:bg-neutral-900/50 border-transparent grayscale opacity-60"
                                        }
                                    `}
                                >
                                    <div className={`text-4xl mb-4 text-center transition-transform duration-300 ${isUnlocked ? "group-hover:scale-110" : ""}`}>
                                        {badge.icon}
                                    </div>
                                    <div className="text-center">
                                        <h3 className={`font-bold text-sm mb-1 ${isUnlocked ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-500"}`}>
                                            {badge.displayName}
                                        </h3>
                                        <p className="text-[10px] text-neutral-400 leading-tight">
                                            {badge.description}
                                        </p>
                                        {!isUnlocked && (
                                            <div className="mt-2 text-[10px] font-bold text-neutral-300 uppercase tracking-wider flex items-center justify-center gap-1">
                                                <span>🔒</span> Locked
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
            </div>
        </div>
    );
}
