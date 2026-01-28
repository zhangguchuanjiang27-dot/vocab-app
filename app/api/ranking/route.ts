import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "lifetime"; // lifetime, yearly, monthly, weekly

    // 期間の開始日を計算
    let startDate = new Date(0); // Default: 1970-01-01 (Lifetime)
    const now = new Date();

    if (period === "weekly") {
        // 今週の月曜日 (タイムゾーン等の厳密さは一旦簡易的に)
        const day = now.getDay(); // 0:Sun, 1:Mon...
        const diff = day === 0 ? 6 : day - 1; // 月曜を0とするための補正
        startDate = new Date(now);
        startDate.setDate(now.getDate() - diff);
        startDate.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
        // 今月の1日
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "yearly") {
        // 今年の1月1日
        startDate = new Date(now.getFullYear(), 0, 1);
    }

    try {
        // Raw SQLを使って高速集計
        // User -> Deck -> WordCard の結合を行い、Deckの所有者(User)ごとにWordCardをカウント
        /*
          SELECT 
            u.id, 
            u.name, 
            u.image, 
            COUNT(w.id) as count 
          FROM "User" u
          JOIN "Deck" d ON d."userId" = u.id
          JOIN "WordCard" w ON w."deckId" = d.id
          WHERE w."createdAt" >= $startDate
          GROUP BY u.id
          ORDER BY count DESC
          LIMIT 50;
        */

        // Prisma.sqlテンプレートタグを使う場合もありますが、$queryRawで直接書く際はパラメータ化に注意
        // 日付比較のためパラメータとして渡す
        const rankings: any[] = await prisma.$queryRaw`
            SELECT 
                u.id, 
                u.name, 
                u.image, 
                CAST(COUNT(w.id) AS INTEGER) as word_count
            FROM "User" u
            JOIN "Deck" d ON d."userId" = u.id
            JOIN "WordCard" w ON w."deckId" = d.id
            WHERE w."createdAt" >= ${startDate} AND u."isPublicRanking" = true
            GROUP BY u.id
            ORDER BY word_count DESC
            LIMIT 50;
        `;

        // BigInt対策（PrismaのCOUNTはBigIntで返ることがあるため、JSONにする前に変換が必要な場合があるが、CAST AS INTEGERしてるので多分大丈夫）
        //念の為整形
        const formattedRankings = rankings.map(r => ({
            id: r.id,
            name: r.name || "Unknown User",
            image: r.image,
            count: Number(r.word_count) // 確実にNumber化
        }));

        return NextResponse.json(formattedRankings);
    } catch (e) {
        console.error("Ranking API Error:", e);
        return NextResponse.json({ error: "Failed to fetch ranking" }, { status: 500 });
    }
}
