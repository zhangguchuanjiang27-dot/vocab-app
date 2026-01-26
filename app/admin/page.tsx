"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (!res.ok) throw new Error("Forbidden or error");
            const data = await res.json();
            setUsers(data);
        } catch (err) {
            setError("権限がないか、エラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const updateUser = async (id: string, updates: any) => {
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            if (res.ok) {
                alert("更新しました");
                fetchUsers();
            } else {
                alert("更新失敗");
            }
        } catch (err) {
            alert("エラー");
        }
    };

    if (loading) return <div className="p-10 font-bold">Checking Admin Access...</div>;
    if (error) return <div className="p-10 text-red-500 font-bold">{error}</div>;

    return (
        <div className="min-h-screen bg-white dark:bg-black p-8 font-sans">
            <header className="mb-12 flex justify-between items-end">
                <div>
                    <Link href="/" className="text-sm font-bold text-neutral-500 hover:text-indigo-500 mb-4 inline-block">← Back to App</Link>
                    <h1 className="text-4xl font-black">Admin Dashboard</h1>
                </div>
                <div className="text-sm font-bold text-neutral-400">
                    Total Users: {users.length}
                </div>
            </header>

            <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-2xl">
                <table className="w-full text-left">
                    <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                        <tr className="text-xs font-black text-neutral-400 uppercase tracking-widest">
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Plan</th>
                            <th className="px-6 py-4">Coins</th>
                            <th className="px-6 py-4">Stats</th>
                            <th className="px-6 py-4">Login</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
                        {users.map((user) => (
                            <tr key={user.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0">
                                            {user.image && <img src={user.image} className="w-full h-full object-cover" />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm">{user.name}</div>
                                            <div className="text-[10px] text-neutral-500">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <select
                                        value={user.role}
                                        onChange={(e) => updateUser(user.id, { role: e.target.value })}
                                        className="text-xs font-bold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded"
                                    >
                                        <option value="user">USER</option>
                                        <option value="admin">ADMIN</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4">
                                    <select
                                        value={user.subscriptionPlan || ""}
                                        onChange={(e) => updateUser(user.id, { subscriptionPlan: e.target.value || null })}
                                        className={`text-xs font-bold px-2 py-1 rounded 
                                            ${user.subscriptionPlan === 'unlimited' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                                                : user.subscriptionPlan === 'pro' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
                                                    : user.subscriptionPlan === 'basic' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                                                        : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}`
                                        }
                                    >
                                        <option value="">FREE</option>
                                        <option value="basic">BASIC</option>
                                        <option value="pro">PRO</option>
                                        <option value="unlimited">UNLIMITED</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4">
                                    <input
                                        type="number"
                                        defaultValue={user.credits}
                                        onBlur={(e) => updateUser(user.id, { credits: parseInt(e.target.value) })}
                                        className="w-16 bg-transparent border-b border-neutral-300 dark:border-neutral-700 text-sm font-mono font-bold"
                                    />
                                </td>
                                <td className="px-6 py-4 text-xs">
                                    <span className="text-neutral-500">XP:</span> <span className="font-bold">{user.xp}</span>
                                    <br />
                                    <span className="text-neutral-500">Decks:</span> <span className="font-bold">{user._count?.decks}</span>
                                </td>
                                <td className="px-6 py-4 text-[10px] text-neutral-400 font-mono">
                                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'N/A'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
