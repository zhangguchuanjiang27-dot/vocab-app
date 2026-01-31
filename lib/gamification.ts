import { prisma } from "@/app/lib/prisma";

// バッジの定義データ
const BADGE_DEFINITIONS = [
    {
        name: "streak_3",
        displayName: "三日坊主卒業",
        description: "3日連続で学習しました",
        icon: "🥉",
        condition: "Last login streak >= 3"
    },
    {
        name: "streak_7",
        displayName: "継続の始まり",
        description: "7日連続で学習しました",
        icon: "🥈",
        condition: "Last login streak >= 7"
    },
    {
        name: "streak_14",
        displayName: "習慣化",
        description: "14日連続で学習しました",
        icon: "🥇",
        condition: "Last login streak >= 14"
    },
    {
        name: "streak_30",
        displayName: "一ヶ月継続",
        description: "30日連続で学習しました",
        icon: "🎖️",
        condition: "Last login streak >= 30"
    },
    {
        name: "streak_60",
        displayName: "二ヶ月継続",
        description: "60日連続で学習しました",
        icon: "🏵️",
        condition: "Last login streak >= 60"
    },
    {
        name: "streak_100",
        displayName: "百日修行",
        description: "100日連続で学習しました",
        icon: "💯",
        condition: "Last login streak >= 100"
    },
    {
        name: "streak_200",
        displayName: "二百日の軌跡",
        description: "200日連続で学習しました",
        icon: "🔥",
        condition: "Last login streak >= 200"
    },
    {
        name: "streak_365",
        displayName: "一年継続",
        description: "365日連続で学習しました",
        icon: "👑",
        condition: "Last login streak >= 365"
    },
    {
        name: "librarian",
        displayName: "図書館長",
        description: "デッキを100個以上作成しました",
        icon: "📚",
        condition: "Deck count >= 100"
    },
    {
        name: "night_owl",
        displayName: "夜更かし",
        description: "深夜（2時〜5時）に学習しました",
        icon: "🦉",
        condition: "Active between 2am and 5am"
    },
    {
        name: "level_5",
        displayName: "新人",
        description: "レベル5に到達しました",
        icon: "🌟",
        condition: "Level >= 5"
    },
    {
        name: "level_20",
        displayName: "中堅",
        description: "レベル20に到達しました",
        icon: "🌠",
        condition: "Level >= 20"
    },
    {
        name: "level_50",
        displayName: "伝説",
        description: "レベル50に到達しました",
        icon: "🌌",
        condition: "Level >= 50"
    },
];

/**
 * バッジ定義をデータベースに初期化・同期する
 */
export async function initBadges() {
    // 1. 定義にないバッジを削除する（不要なバッジの掃除）
    const definedNames = BADGE_DEFINITIONS.map(b => b.name);

    // まず、削除対象のバッジを持っているユーザーのデータを消す (外部キー制約回避)
    const badgesToDelete = await (prisma as any).badge.findMany({
        where: { name: { notIn: definedNames } }
    });
    const badgeIdsToDelete = badgesToDelete.map((b: any) => b.id);

    if (badgeIdsToDelete.length > 0) {
        await (prisma as any).userBadge.deleteMany({
            where: { badgeId: { in: badgeIdsToDelete } }
        });
    }

    // その後、バッジ定義自体を削除
    // @ts-ignore
    await (prisma as any).badge.deleteMany({
        where: {
            name: { notIn: definedNames }
        }
    });

    // 2. 定義済みのバッジを作成・更新する
    for (const badge of BADGE_DEFINITIONS) {
        // @ts-ignore
        await (prisma as any).badge.upsert({
            where: { name: badge.name },
            update: {
                displayName: badge.displayName,
                description: badge.description,
                icon: badge.icon,
                condition: badge.condition,
            },
            create: {
                name: badge.name,
                displayName: badge.displayName,
                description: badge.description,
                icon: badge.icon,
                condition: badge.condition,
            },
        });
    }
}

/**
 * ユーザーにXPを付与し、バッジ獲得チェックを行う
 */
export async function addXp(userId: string, amount: number) {
    // XPを加算
    const user = await prisma.user.update({
        where: { id: userId },
        data: {
            // @ts-ignore
            xp: { increment: amount },
            weeklyXp: { increment: amount },
        } as any,
    });

    // バッジ獲得チェック（非同期で実行）
    checkBadges(userId).catch(console.error);

    return user;
}

/**
 * バッジの獲得条件をチェックし、付与する
 */
export async function checkBadges(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            _count: {
                select: { decks: true }
            },
            badges: {
                select: { badgeId: true }
            }
        } as any
    });

    if (!user) return;

    // バッジ定義を取得
    const badges = await (prisma as any).badge.findMany();
    const badgeMap = new Map(badges.map((b: any) => [b.name, b]));

    // ユーザーが既に持っているバッジを確認
    const userBadges = await (prisma as any).userBadge.findMany({
        where: { userId },
        include: { badge: true }
    });
    const ownedBadgeNames = new Set(userBadges.map((ub: any) => ub.badge.name));

    const newBadges = [];

    // --- 各バッジの条件判定 ---

    // 1. 📚 図書館長 (decks >= 100)
    // @ts-ignore
    if (!ownedBadgeNames.has("librarian") && user._count.decks >= 100) {
        newBadges.push("librarian");
    }

    // 2. 🦉 夜更かし (現在時刻が 02:00 - 05:00)
    // 日本時間(JST)を想定
    if (!ownedBadgeNames.has("night_owl")) {
        // サーバー時間の考慮が必要だが、簡易的にDateを使う
        // 日本時間はUTC+9
        const now = new Date();
        const jstHour = (now.getUTCHours() + 9) % 24;
        if (jstHour >= 2 && jstHour < 5) {
            newBadges.push("night_owl");
        }
    }

    // --- レベル到達バッジ ---
    // @ts-ignore
    const { level } = getLevelInfo(user.xp || 0);

    // 4. 🌟 新人 (Level 5)
    if (!ownedBadgeNames.has("level_5") && level >= 5) {
        newBadges.push("level_5");
    }

    // 5. 🌠 中堅 (Level 20)
    if (!ownedBadgeNames.has("level_20") && level >= 20) {
        newBadges.push("level_20");
    }

    // 6. 🌌 伝説 (Level 50)
    if (!ownedBadgeNames.has("level_50") && level >= 50) {
        newBadges.push("level_50");
    }

    // --- 継続日数バッジ (Streak) ---
    // User定義に loginStreak がある前提
    // @ts-ignore
    const streak = user.loginStreak || 0;

    const streakBadges = [
        { days: 3, name: "streak_3" },
        { days: 7, name: "streak_7" },
        { days: 14, name: "streak_14" },
        { days: 30, name: "streak_30" },
        { days: 60, name: "streak_60" },
        { days: 100, name: "streak_100" },
        { days: 200, name: "streak_200" },
        { days: 365, name: "streak_365" },
    ];

    for (const sb of streakBadges) {
        if (!ownedBadgeNames.has(sb.name) && streak >= sb.days) {
            newBadges.push(sb.name);
        }
    }

    // --- バッジ付与処理 ---
    for (const badgeName of newBadges) {
        const badge: any = badgeMap.get(badgeName);
        if (badge) {
            await (prisma as any).userBadge.create({
                data: {
                    userId,
                    badgeId: badge.id
                }
            });
            console.log(`User ${userId} earned badge: ${badge.name}`);
        }
    }
}

// Leveling Logic
export const getLevelInfo = (totalXp: number) => {
    let level = 1;
    let xpInCurrentLevel = totalXp;
    let xpRequiredForNext = 100;

    while (xpInCurrentLevel >= xpRequiredForNext) {
        xpInCurrentLevel -= xpRequiredForNext;
        level++;
        xpRequiredForNext = level * 100;
    }

    return { level, xpInCurrentLevel, xpRequiredForNext, progress: (xpInCurrentLevel / xpRequiredForNext) * 100 };
};
