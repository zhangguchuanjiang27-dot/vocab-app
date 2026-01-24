"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// 型定義
type User = {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    credits: number;
    _count: {
        decks: number;
    };
};

export default function AdminPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/");
        } else if (session?.user) {
            fetchUsers();
        }
    }, [session, status]);

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            } else {
                // 管理者でない場合はトップへ
                router.push("/");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleGiveCredit = async (userId: string, amount: number) => {
        if (!confirm(`このユーザーに ${amount} クレジットを付与しますか？`)) return;

        setProcessingId(userId);
        try {
            const res = await fetch("/api/admin/credit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, amount }),
            });

            if (res.ok) {
                alert("付与しました！");
                fetchUsers(); // リスト更新
            } else {
                alert("エラーが発生しました");
            }
        } catch (e) {
            console.error(e);
            alert("通信エラー");
        } finally {
            setProcessingId(null);
        }
    };

    if (status === "loading" || loading) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-black p-6 sm:p-12 font-sans">
            <div className="max-w-6xl mx-auto">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-black dark:text-white">Admin Dashboard</h1>
                    <a href="/" className="text-sm font-bold text-neutral-500 hover:text-indigo-500">← Back to App</a>
                </header>

                <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-sm">
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-neutral-100 dark:bg-neutral-800 text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                                    <th className="p-4 font-bold">User</th>
                                    <th className="p-4 font-bold">Credits</th>
                                    <th className="p-4 font-bold">Decks</th>
                                    <th className="p-4 font-bold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                {user.image ? (
                                                    <img src={user.image} alt="" className="w-10 h-10 rounded-full border border-neutral-200 dark:border-neutral-700" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-lg">👤</div>
                                                )}
                                                <div>
                                                    <p className="font-bold text-neutral-900 dark:text-neutral-100">{user.name || "No Name"}</p>
                                                    <p className="text-xs text-neutral-400">{user.email}</p>
                                                    <p className="text-[10px] text-neutral-300 font-mono mt-0.5">{user.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="font-mono font-bold text-lg text-indigo-600 dark:text-indigo-400">
                                                {user.credits.toLocaleString()}
                                            </span>
                                            <span className="text-xs text-neutral-400 ml-1">credits</span>
                                        </td>
                                        <td className="p-4 text-neutral-500">
                                            <span className="font-bold">{user._count.decks}</span> decks
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-2">
                                                <ActionButton amount={100} userId={user.id} processingId={processingId} onGive={handleGiveCredit} color="emerald" />
                                                <ActionButton amount={500} userId={user.id} processingId={processingId} onGive={handleGiveCredit} color="indigo" />
                                                <ActionButton amount={1000} userId={user.id} processingId={processingId} onGive={handleGiveCredit} color="amber" />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-neutral-100 dark:divide-neutral-800">
                        {users.map((user) => (
                            <div key={user.id} className="p-4 flex flex-col gap-4">
                                {/* Header: Avatar + Info */}
                                <div className="flex items-start gap-3">
                                    {user.image ? (
                                        <img src={user.image} alt="" className="w-12 h-12 rounded-full border border-neutral-200 dark:border-neutral-700" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xl">👤</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-neutral-900 dark:text-neutral-100 text-lg truncate">{user.name || "No Name"}</p>
                                        <p className="text-sm text-neutral-400 truncate">{user.email}</p>
                                        <div className="flex items-center gap-3 mt-1">
                                            <div className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                                                🪙 {user.credits.toLocaleString()}
                                            </div>
                                            <div className="text-xs text-neutral-500 font-medium">
                                                📚 {user._count.decks} decks
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-3 gap-2">
                                    <ActionButton amount={100} userId={user.id} processingId={processingId} onGive={handleGiveCredit} color="emerald" />
                                    <ActionButton amount={500} userId={user.id} processingId={processingId} onGive={handleGiveCredit} color="indigo" />
                                    <ActionButton amount={1000} userId={user.id} processingId={processingId} onGive={handleGiveCredit} color="amber" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Button Component
function ActionButton({ amount, userId, processingId, onGive, color }: {
    amount: number;
    userId: string;
    processingId: string | null;
    onGive: (id: string, amount: number) => void;
    color: "emerald" | "indigo" | "amber";
}) {
    const colorClasses = {
        emerald: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800",
        indigo: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800",
        amber: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800",
    };

    return (
        <button
            onClick={() => onGive(userId, amount)}
            disabled={!!processingId}
            className={`
                w-full px-3 py-2 rounded-xl text-xs font-bold transition-all
                disabled:opacity-50 disabled:cursor-not-allowed
                shadow-sm hover:shadow active:scale-95
                ${colorClasses[color]}
            `}
        >
            +{amount.toLocaleString()}
        </button>
    );
}
