import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { getLevelInfo } from "@/lib/gamification";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect("/");
    }

    const userId = session.user.id;

    // Fetch full user profile including badges
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            // @ts-ignore
            badges: {
                include: { badge: true },
                orderBy: { obtainedAt: 'desc' }
            },
            _count: {
                select: { decks: true }
            }
        }
    });

    if (!user) {
        redirect("/");
    }

    // Fetch all available badges to show locked ones
    // @ts-ignore
    const allBadges = await prisma.badge.findMany({
        orderBy: { createdAt: 'asc' }
    });

    // Calculate Level
    // @ts-ignore
    const { level, xpInCurrentLevel, xpRequiredForNext, progress } = getLevelInfo(user.xp || 0);

    // Get earned badge IDs
    // @ts-ignore
    const earnedBadgeIds = new Set(user.badges.map((ub: any) => ub.badgeId));

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
                            {user.image ? (
                                <img src={user.image} alt={user.name || "User"} className="w-24 h-24 rounded-full border-4 border-white dark:border-neutral-800 shadow-lg" />
                            ) : (
                                <div className="w-24 h-24 rounded-full bg-indigo-100 dark:bg-indigo-900 border-4 border-white dark:border-neutral-800 shadow-lg flex items-center justify-center text-4xl">
                                    👤
                                </div>
                            )}
                            <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white text-xs font-black px-3 py-1 rounded-full border-2 border-white dark:border-neutral-800">
                                LV.{level}
                            </div>
                        </div>

                        {/* Info */}
                        <div className="text-center sm:text-left flex-1 min-w-0 z-10">
                            <h1 className="text-3xl font-black text-neutral-900 dark:text-white truncate">{user.name}</h1>
                            <p className="text-neutral-500 dark:text-neutral-400 font-medium mb-4">{user.email}</p>

                            {/* Stats */}
                            <div className="flex flex-wrap justify-center sm:justify-start gap-4">
                                <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Total XP</div>
                                    {/* @ts-ignore */}
                                    <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">{user.xp?.toLocaleString()}</div>
                                </div>
                                <div className="bg-neutral-100 dark:bg-neutral-800 px-4 py-2 rounded-xl">
                                    <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Credits</div>
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
                        {/* @ts-ignore */}
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
                                        <h3 className={`font-bold text-sm mb-1 ${isUnlocked ? "text-neutral-900 dark:text-neutral-100" : "text-neutral-400"}`}>
                                            {badge.displayName}
                                        </h3>
                                        <p className="text-[10px] text-neutral-400 leading-tight">
                                            {isUnlocked ? badge.description : "???"}
                                        </p>
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
