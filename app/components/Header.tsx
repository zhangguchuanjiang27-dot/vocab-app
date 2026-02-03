"use client";


import { useEffect, useState } from "react";
import Link from "next/link"; // Keep Link
import { signOut } from "next-auth/react"; // Add signOut
import { Session } from "next-auth";

type HeaderProps = {
    initialCredits: number;
    session: Session | null;
    plan?: string | null;
    subscriptionPeriodEnd?: string | null;
    role?: string;
    userImage?: string | null;
};

export default function Header({ initialCredits, session, plan, subscriptionPeriodEnd, role, userImage }: HeaderProps) {
    const [streak, setStreak] = useState<number | null>(null);
    const [streakUpdated, setStreakUpdated] = useState(false);
    const [isLine, setIsLine] = useState(false);

    useEffect(() => {
        // Detect LINE In-App Browser
        if (typeof navigator !== "undefined" && /Line\//i.test(navigator.userAgent)) {
            setIsLine(true);
        }
    }, []);

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

    const [showContactModal, setShowContactModal] = useState(false);
    const [contactEmail, setContactEmail] = useState("");
    const [contactMessage, setContactMessage] = useState("");
    const [contactType, setContactType] = useState("other");
    const [isSendingContact, setIsSendingContact] = useState(false);
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    useEffect(() => {
        if (session?.user) {
            setContactEmail(session.user.email || "");
        }
    }, [session]);

    const handleContactSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSendingContact(true);
        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: contactEmail, message: contactMessage, type: contactType })
            });
            if (res.ok) {
                alert("送信しました！貴重なご意見ありがとうございます。");
                setContactMessage("");
                setContactType("other");
                setShowContactModal(false);
            } else {
                alert("送信に失敗しました。時間をおいて再試行してください。");
            }
        } catch (err) {
            alert("エラーが発生しました。");
        } finally {
            setIsSendingContact(false);
        }
    };

    return (
        <>
            {/* LINE Browser Warning */}
            {isLine && !session && (
                <div className="fixed top-20 left-4 right-4 z-[100] bg-red-600/90 backdrop-blur-md text-white p-4 rounded-xl border border-red-500 shadow-2xl animate-in slide-in-from-top-4 fade-in duration-500">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <p className="font-bold text-sm mb-1">LINEアプリ内ではログインできません</p>
                            <p className="text-xs opacity-90 leading-relaxed">
                                Googleのセキュリティ仕様により、LINE内ブラウザからのログインはブロックされます。
                                <br />
                                <strong>右上のメニューアイコン <span className="text-lg leading-none">⋮</span> または <span className="text-lg leading-none">↗</span></strong> をタップし、
                                <br />
                                <strong>「デフォルトのブラウザで開く」</strong>を選択してください。
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-5xl mx-auto px-2 sm:px-6 h-16 flex items-center justify-between gap-2 overflow-x-auto md:overflow-visible no-scrollbar">
                {/* Left Side: Logo & Nav Links */}
                <div className="flex items-center gap-3 sm:gap-6 flex-shrink-0">
                    <Link href="/" className="font-black text-xl tracking-tight flex items-center gap-1 sm:gap-2">
                        <img src="/logo.png" alt="Voca Logo" className="w-9 h-9 sm:w-8 sm:h-8 object-contain flex-shrink-0" />
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-indigo-300">Voca</span>
                    </Link>

                    {session && (
                        <div className="flex items-center gap-2 sm:gap-2">
                            <Link href="/ranking" className="flex items-center justify-center w-9 h-9 sm:w-auto sm:px-3 sm:h-auto sm:py-1.5 rounded-full hover:bg-neutral-900 transition-colors group">
                                <span className="group-hover:scale-110 transition-transform text-xl sm:text-base leading-none -mt-1">👑</span>
                                <span className="hidden sm:inline text-sm font-bold text-neutral-400 ml-1">ランキング</span>
                            </Link>

                            <button
                                onClick={() => setShowContactModal(true)}
                                className="flex items-center justify-center w-9 h-9 sm:w-auto sm:px-3 sm:h-auto sm:py-1.5 rounded-full hover:bg-neutral-900 transition-colors group"
                            >
                                <span className="group-hover:scale-110 transition-transform text-xl sm:text-base leading-none -mt-0.5">💌</span>
                                <span className="hidden sm:inline text-sm font-bold text-neutral-400 ml-1">サポート</span>
                            </button>
                        </div>
                    )}

                </div>

                {/* Right Side: Stats & User Actions */}
                <div className="flex items-center gap-1.5 sm:gap-6 flex-shrink-0">
                    {session ? (
                        <>
                            {/* Streak Badge */}
                            {streak !== null && (
                                <div className={`flex items-center justify-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full border bg-orange-950/30 border-orange-900 text-orange-400 font-bold font-mono text-xs sm:text-sm transition-all ${streakUpdated ? 'scale-110 shadow-orange-500/50 shadow-lg' : ''}`} title="連続ログイン日数">
                                    <span className={`${streakUpdated ? "animate-bounce" : ""} text-base sm:text-lg leading-none`}>🔥</span>
                                    <span className="leading-none pt-0.5">
                                        {streak}
                                        <span className="ml-1 text-[10px] uppercase opacity-80 hidden sm:inline">Day{streak !== 1 ? 's' : ''}</span>
                                    </span>
                                </div>
                            )}

                            {/* Plan Badge (Hidden on Mobile) */}
                            <div className={`
                            hidden md:flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-black tracking-widest uppercase
                            ${plan === 'pro'
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                    : plan === 'basic'
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                        : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                                }
                        `}>
                                {plan || 'FREE'}
                            </div>

                            <div className="flex items-center gap-1.5 px-2 py-1 sm:gap-2 sm:px-3 sm:py-1.5 bg-neutral-900 rounded-full border border-neutral-800 relative group/wallet whitespace-nowrap">
                                <span className="text-base sm:text-lg leading-none">🪙</span>
                                <span className="font-bold font-mono text-xs sm:text-sm leading-none pt-0.5">
                                    {plan === 'unlimited' ? "無制限" : initialCredits}
                                </span>

                                {/* Days Remaining Tooltip/Badge */}
                                {plan && daysRemaining !== null && (
                                    <div className="hidden sm:flex ml-1 px-1.5 py-0.5 bg-neutral-800 rounded text-[9px] font-bold text-neutral-400 items-center gap-1 group-hover/wallet:scale-105 transition-transform">
                                        <span className="opacity-70">あと</span>
                                        <span className={`${daysRemaining <= 3 ? 'text-red-500 animate-pulse' : ''}`}>{daysRemaining}日</span>
                                    </div>
                                )}

                                <Link href="/checkout" className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold hover:bg-indigo-500 transition-colors ml-1 leading-none flex items-center h-4 sm:h-auto">
                                    追加
                                </Link>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-neutral-800">
                                <Link href="/profile" className="flex-shrink-0 block">
                                    {userImage || session.user?.image ? (
                                        <img src={userImage || session.user.image || ""} alt="User" className="w-8 h-8 rounded-full border border-neutral-800 hover:scale-110 transition-transform block" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-300 border border-neutral-800 hover:scale-110 transition-transform">
                                            {session.user?.name?.[0] || "U"}
                                        </div>
                                    )}
                                </Link>
                                <button
                                    onClick={() => setShowLogoutModal(true)}
                                    className="group flex items-center justify-center p-1"
                                    title="ログアウト"
                                >
                                    {/* Mobile Icon */}
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 sm:hidden text-neutral-400 group-hover:text-red-500 transition-colors flex-shrink-0">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                                    </svg>
                                    {/* Desktop Text */}
                                    <span className="hidden sm:block text-xs font-bold text-neutral-500 group-hover:text-white transition-colors">
                                        ログアウト
                                    </span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <Link href="/api/auth/signin" className="text-sm font-bold bg-white text-black px-4 py-2 rounded-full hover:opacity-80 transition-opacity">
                            ログイン
                        </Link>
                    )}
                </div>

                {/* Contact Modal */}
                {showContactModal && (
                    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                        <div className="bg-neutral-900 w-full max-w-lg rounded-2xl p-8 shadow-2xl border border-neutral-800 relative mt-60">
                            <button
                                onClick={() => setShowContactModal(false)}
                                className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-200 p-2"
                            >
                                ✕
                            </button>

                            <h2 className="text-xl font-bold mb-1">お問い合わせ</h2>
                            <p className="text-xs text-neutral-500 mb-6">不具合の報告や、機能のリクエストはこちらから。</p>

                            <form onSubmit={handleContactSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-neutral-300 mb-1">メールアドレス</label>
                                    <input
                                        type="email"
                                        required
                                        value={contactEmail}
                                        onChange={(e) => setContactEmail(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                                        placeholder="your@email.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-300 mb-1">種類</label>
                                    <select
                                        value={contactType}
                                        onChange={(e) => setContactType(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm cursor-pointer"
                                    >
                                        <option value="bug">不具合報告 (Bug)</option>
                                        <option value="feature">機能リクエスト (Feature Request)</option>
                                        <option value="other">その他 (Other)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-neutral-300 mb-1">内容</label>
                                    <textarea
                                        required
                                        value={contactMessage}
                                        onChange={(e) => setContactMessage(e.target.value)}
                                        rows={4}
                                        className="w-full px-3 py-2 rounded-lg border border-neutral-800 bg-neutral-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none text-sm"
                                        placeholder="詳細をご記入ください..."
                                    ></textarea>
                                </div>
                                <div className="flex gap-3 mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowContactModal(false)}
                                        className="flex-1 py-3 bg-neutral-800 text-neutral-300 rounded-xl font-bold hover:bg-neutral-700 transition-colors text-sm"
                                    >
                                        キャンセル
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSendingContact}
                                        className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50 text-sm"
                                    >
                                        {isSendingContact ? "送信中..." : "送信する"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Logout Confirmation Modal */}
                {showLogoutModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-neutral-900 rounded-2xl shadow-xl w-full max-w-sm p-6 border border-neutral-800 scale-100 animate-in zoom-in-95 duration-200 mt-24">
                            <h3 className="text-lg font-bold text-center mb-2 text-white">ログアウトしますか？</h3>
                            <p className="text-sm font-medium text-neutral-300 text-center mb-6 leading-relaxed">
                                アカウントからログアウトします。<br className="hidden sm:block" />
                                次回利用時は再ログインが必要です。
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowLogoutModal(false)}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition-colors"
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={() => signOut({ callbackUrl: "/" })}
                                    className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-red-600 text-white hover:bg-red-500 transition-colors"
                                >
                                    ログアウト
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

