import { prisma } from "@/app/lib/prisma";

// バッジの定義データ
const BADGE_DEFINITIONS = [
    {
        name: "streak_master",
        displayName: "継続の鬼",
        description: "3日連続で学習しました",
        icon: "🏆",
        condition: "Last login streak >= 3"
    },
    {
        name: "night_owl",
        displayName: "夜更かし",
        description: "深夜2時〜5時の間に学習しました",
        icon: "🦉",
        condition: "Study between 2AM and 5AM"
    },
    {
        name: "mad_scientist",
        displayName: "実験狂",
        description: "例文生成を50回行いました",
        icon: "🧪",
        condition: "Generate details count >= 50"
    },
    {
        name: "librarian",
        displayName: "図書館長",
        description: "デッキを10個以上作成しました",
        icon: "📚",
        condition: "Deck count >= 10"
    },
    {
        name: "millionaire",
        displayName: "富豪",
        description: "コインを1000枚以上保有しています",
        icon: "💎",
        condition: "Coins >= 1000"
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
    for (const badge of BADGE_DEFINITIONS) {
        await prisma.badge.upsert({
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
            xp: { increment: amount },
            weeklyXp: { increment: amount },
        },
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
        }
    });

    if (!user) return;

    // 既に持っているバッジのIDリスト
    const ownedBadgeIds = new Set();
    // Note: user.badges は UserBadge[] なので、そこから badgeId を引くために少しロジックが必要
    // しかし prisma.badge.findMany で name から ID を引く方が楽かも

    // バッジ定義を取得
    const badges = await prisma.badge.findMany();
    const badgeMap = new Map(badges.map(b => [b.name, b]));

    // ユーザーが既に持っているバッジを確認
    const userBadges = await prisma.userBadge.findMany({
        where: { userId },
        include: { badge: true }
    });
    const ownedBadgeNames = new Set(userBadges.map(ub => ub.badge.name));

    const newBadges = [];

    // --- 各バッジの条件判定 ---

    // 1. 💎 富豪 (credits >= 1000)
    if (!ownedBadgeNames.has("millionaire") && user.credits >= 1000) {
        newBadges.push("millionaire");
    }

    // 2. 📚 図書館長 (decks >= 10)
    if (!ownedBadgeNames.has("librarian") && user._count.decks >= 10) {
        newBadges.push("librarian");
    }

    // 3. 🦉 夜更かし (現在時刻が 02:00 - 05:00)
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
    const level = Math.floor(user.xp / 100) + 1;

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

    // TODO: 他のバッジ条件（継続日数、生成回数など）はDBに詳細ログがないため、
    // 必要に応じてUserモデルにカウンターを追加するか、簡易的な判定で実装する。

    // --- バッジ付与処理 ---
    for (const badgeName of newBadges) {
        const badge = badgeMap.get(badgeName);
        if (badge) {
            await prisma.userBadge.create({
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
