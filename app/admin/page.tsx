"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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
                    <div className="overflow-x-auto">
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
                                                {user.image && <img src={user.image} alt="" className="w-8 h-8 rounded-full" />}
                                                <div>
                                                    <p className="font-bold text-neutral-900 dark:text-neutral-100">{user.name}</p>
                                                    <p className="text-xs text-neutral-400">{user.email}</p>
                                                    <p className="text-[10px] text-neutral-300 font-mono">{user.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="font-mono font-bold text-lg text-indigo-600 dark:text-indigo-400">
                                                {user.credits.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="p-4 text-neutral-500">
                                            {user._count.decks}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleGiveCredit(user.id, 100)}
                                                    disabled={!!processingId}
                                                    className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-200 transition disabled:opacity-50"
                                                >
                                                    +100
                                                </button>
                                                <button
                                                    onClick={() => handleGiveCredit(user.id, 500)}
                                                    disabled={!!processingId}
                                                    className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-200 transition disabled:opacity-50"
                                                >
                                                    +500
                                                </button>
                                                <button
                                                    onClick={() => handleGiveCredit(user.id, 1000)}
                                                    disabled={!!processingId}
                                                    className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200 transition disabled:opacity-50"
                                                >
                                                    +1000
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
