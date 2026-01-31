"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type User = {
    id: string;
    name: string;
    email: string;
    image?: string;
    role: string;
    subscriptionPlan: string | null;
    subscriptionPeriodEnd: string | null;
    credits: number;
    xp: number;
    lastLoginAt?: string;
    createdAt: string;
    _count: {
        decks: number;
    };
};

type Inquiry = {
    id: string;
    email: string;
    type: string;
    message: string;
    status: 'open' | 'closed';
    createdAt: string;
    user?: {
        name: string | null;
        image: string | null;
        email: string | null;
    } | null;
};

export default function AdminPage() {
    // ... existing code ...

    const [activeTab, setActiveTab] = useState<'users' | 'inquiries'>('users');
    const [inquiryStatusFilter, setInquiryStatusFilter] = useState<'open' | 'closed'>('open');

    const [users, setUsers] = useState<User[]>([]);
    const [inquiries, setInquiries] = useState<Inquiry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [filter, setFilter] = useState<'all' | 'free' | 'basic' | 'pro' | 'unlimited'>('all');
    const [searchTerm, setSearchTerm] = useState("");
    const [sortKey, setSortKey] = useState<'lastLogin' | 'created'>('lastLogin');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, inquiriesRes] = await Promise.all([
                fetch("/api/admin/users"),
                fetch("/api/admin/inquiries")
            ]);

            if (!usersRes.ok || !inquiriesRes.ok) throw new Error("Forbidden or error");

            const usersData = await usersRes.json();
            const inquiriesData = await inquiriesRes.json();

            setUsers(usersData);
            setInquiries(inquiriesData);
        } catch (err) {
            setError("権限がないか、エラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
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
                fetchData();
            } else {
                alert("更新失敗");
            }
        } catch (err) {
            alert("エラー");
        }
    };

    const deleteUser = async (id: string) => {
        if (!confirm("本当にこのユーザーを削除しますか？\nこの操作は取り消せません。")) return;
        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                alert("削除しました");
                fetchData();
            } else {
                alert("削除失敗");
            }
        } catch (err) {
            alert("エラーが発生しました");
        }
    };

    const updateInquiryStatus = async (id: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/admin/inquiries`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, status: newStatus }),
            });
            if (res.ok) {
                fetchData();
            }
        } catch (err) {
            console.error(err);
        }
    };

    // --- User Filtering & Sorting ---
    const filteredUsers = users.filter(user => {
        // Plan Filter
        const matchesFilter = (() => {
            if (filter === 'all') return true;
            if (filter === 'free') return !user.subscriptionPlan;
            return user.subscriptionPlan === filter;
        })();

        // Search Filter
        const matchesSearch = (() => {
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            return (
                (user.name?.toLowerCase() || "").includes(term) ||
                (user.email?.toLowerCase() || "").includes(term)
            );
        })();

        return matchesFilter && matchesSearch;
    }).sort((a, b) => {
        if (sortKey === 'lastLogin') {
            // undefined 扱い (未ログインは一番後ろ)
            const aTime = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
            const bTime = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
            return bTime - aTime;
        } else {
            const aTime = new Date(a.createdAt).getTime();
            const bTime = new Date(b.createdAt).getTime();
            return bTime - aTime;
        }
    });

    if (loading && users.length === 0) return <div className="p-10 font-bold">Checking Admin Access...</div>;
    if (error) return <div className="p-10 text-red-500 font-bold">{error}</div>;

    return (
        <div className="min-h-screen bg-white dark:bg-black p-8 font-sans">
            <header className="mb-8">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <Link href="/" className="text-sm font-bold text-neutral-500 hover:text-indigo-500 mb-4 inline-block">← Back to App</Link>
                        <h1 className="text-4xl font-black">Admin Dashboard</h1>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 border-b border-neutral-200 dark:border-neutral-800 mb-8">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`pb-4 px-2 font-bold text-sm transition-all ${activeTab === 'users' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-neutral-400 hover:text-neutral-600'}`}
                    >
                        Users ({users.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('inquiries')}
                        className={`pb-4 px-2 font-bold text-sm transition-all ${activeTab === 'inquiries' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-neutral-400 hover:text-neutral-600'}`}
                    >
                        Inquiries ({inquiries.filter(i => i.status === 'open').length} Open)
                    </button>
                </div>

                {activeTab === 'users' && (
                    <div className="flex flex-col gap-6 animate-in fade-in">
                        {/* Search Bar & Filters */}
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="w-full max-w-sm relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                <input
                                    type="text"
                                    placeholder="Search by email or name..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-neutral-100 dark:bg-neutral-900 border-none rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none placeholder-neutral-400"
                                />
                            </div>

                            <div className="flex bg-neutral-100 dark:bg-neutral-900 rounded-lg p-1">
                                <button onClick={() => setSortKey('lastLogin')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${sortKey === 'lastLogin' ? 'bg-white dark:bg-neutral-800 shadow-sm' : 'text-neutral-400'}`}>Last Login</button>
                                <button onClick={() => setSortKey('created')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${sortKey === 'created' ? 'bg-white dark:bg-neutral-800 shadow-sm' : 'text-neutral-400'}`}>Created At</button>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="flex gap-2 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-lg overflow-x-auto max-w-full">
                                {(['all', 'free', 'basic', 'pro', 'unlimited'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setFilter(mode)}
                                        className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap ${filter === mode
                                            ? 'bg-white dark:bg-neutral-800 text-indigo-600 shadow-sm'
                                            : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
                                            }`}
                                    >
                                        {mode} ({users.filter(u => {
                                            if (mode === 'all') return true;
                                            if (mode === 'free') return !u.subscriptionPlan;
                                            return u.subscriptionPlan === mode;
                                        }).length})
                                    </button>
                                ))}
                            </div>
                            <div className="text-sm font-bold text-neutral-400 whitespace-nowrap">
                                Showing: {filteredUsers.length} / {users.length} Users
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-2xl">
                            <table className="w-full text-left">
                                <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                                    <tr className="text-xs font-black text-neutral-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">User</th>
                                        <th className="px-6 py-4">Role / Plan</th>
                                        <th className="px-6 py-4">Coins</th>
                                        <th className="px-6 py-4">Last Login</th>
                                        <th className="px-6 py-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
                                    {filteredUsers.map((user) => (
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
                                                <div className="flex flex-col gap-2">
                                                    <select
                                                        value={user.role}
                                                        onChange={(e) => updateUser(user.id, { role: e.target.value })}
                                                        className="text-xs font-bold bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded w-fit"
                                                    >
                                                        <option value="user">USER</option>
                                                        <option value="admin">ADMIN</option>
                                                    </select>
                                                    <select
                                                        value={user.subscriptionPlan || ""}
                                                        onChange={(e) => updateUser(user.id, { subscriptionPlan: e.target.value || null })}
                                                        className={`text-xs font-bold px-2 py-1 rounded w-fit
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
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        defaultValue={user.credits}
                                                        onBlur={(e) => updateUser(user.id, { credits: parseInt(e.target.value) })}
                                                        className="w-16 bg-transparent border-b border-neutral-300 dark:border-neutral-700 text-sm font-mono font-bold"
                                                    />
                                                    <span className="text-xs text-neutral-400">coins</span>
                                                </div>
                                                <div className="mt-1 text-xs text-neutral-500">
                                                    XP: <span className="font-bold">{user.xp}</span> | Decks: {user._count?.decks}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs font-mono">
                                                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ja-JP") : <span className="text-neutral-300">Never</span>}
                                                </div>
                                                <div className="text-[10px] text-neutral-400 mt-1">
                                                    Joined: {new Date(user.createdAt).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => deleteUser(user.id)}
                                                    className="px-3 py-1.5 bg-red-50 text-red-500 hover:bg-red-100 rounded text-xs font-bold transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'inquiries' && (
                    <div className="flex flex-col gap-6 animate-in fade-in">
                        <div className="flex gap-2 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl w-fit">
                            <button
                                onClick={() => setInquiryStatusFilter('open')}
                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${inquiryStatusFilter === 'open'
                                    ? 'bg-white dark:bg-neutral-800 text-orange-600 shadow-sm'
                                    : 'text-neutral-400 hover:text-neutral-600'
                                    }`}
                            >
                                Open ({inquiries.filter(i => i.status === 'open').length})
                            </button>
                            <button
                                onClick={() => setInquiryStatusFilter('closed')}
                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${inquiryStatusFilter === 'closed'
                                    ? 'bg-white dark:bg-neutral-800 text-green-600 shadow-sm'
                                    : 'text-neutral-400 hover:text-neutral-600'
                                    }`}
                            >
                                Closed ({inquiries.filter(i => i.status === 'closed').length})
                            </button>
                        </div>

                        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-2xl">
                            <table className="w-full text-left">
                                <thead className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                                    <tr className="text-xs font-black text-neutral-400 uppercase tracking-widest">
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Type</th>
                                        <th className="px-6 py-4">User / Email</th>
                                        <th className="px-6 py-4">Message</th>
                                        <th className="px-6 py-4">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
                                    {inquiries.filter(i => i.status === inquiryStatusFilter).map((inquiry) => (
                                        <tr key={inquiry.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <select
                                                    value={inquiry.status}
                                                    onChange={(e) => updateInquiryStatus(inquiry.id, e.target.value)}
                                                    className={`text-xs font-bold px-2 py-1 rounded border-none cursor-pointer outline-none ring-1 ring-inset ${inquiry.status === 'open'
                                                        ? 'bg-orange-50 text-orange-600 ring-orange-200'
                                                        : 'bg-green-50 text-green-600 ring-green-200'
                                                        }`}
                                                >
                                                    <option value="open">Open</option>
                                                    <option value="closed">Closed</option>
                                                </select>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800
                                                    ${inquiry.type === 'bug' ? 'text-red-500' : inquiry.type === 'feature' ? 'text-indigo-500' : 'text-neutral-500'}
                                                `}>
                                                    {inquiry.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {inquiry.user ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden shrink-0">
                                                            {inquiry.user.image && <img src={inquiry.user.image} className="w-full h-full object-cover" />}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-bold">{inquiry.user.name}</div>
                                                            <div className="text-[10px] text-neutral-500">{inquiry.user.email}</div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="text-sm font-bold">{inquiry.email}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 max-w-md">
                                                <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{inquiry.message}</p>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-neutral-400 font-mono">
                                                {new Date(inquiry.createdAt).toLocaleString("ja-JP")}
                                            </td>
                                        </tr>
                                    ))}
                                    {inquiries.filter(i => i.status === inquiryStatusFilter).length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-12 text-center text-neutral-400">
                                                No {inquiryStatusFilter} inquiries found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </header>
        </div>
    );
}
