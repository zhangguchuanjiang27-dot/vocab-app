import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import crypto from 'crypto';

export async function GET() {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // ユーザーの全単語を取得
        const words = await prisma.wordCard.findMany({
            where: {
                deck: {
                    userId: userId
                }
            },
            select: {
                id: true,
                word: true,
                meaning: true,
                partOfSpeech: true,
                example: true,
                example_jp: true,
            }
        });

        if (words.length === 0) {
            return NextResponse.json({
                words: [],
                study_count: 0,
                last_studied_at: null
            });
        }

        // 今日の日付文字列を取得 (サーバー時間基準)
        // 日本時間などに合わせる場合は offset を考慮する必要がありますが、
        // ここではシンプルにサーバーの日付で固定します。
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

        // 各単語に対して、(単語ID + ユーザーID + 日付) から決定論的なハッシュ値を計算
        // これにより、同じ日・同じユーザー・同じ単語セットであれば、常に同じ10単語が選ばれます
        const wordsWithScores = words.map(word => {
            const hash = crypto.createHash('sha256')
                .update(word.id + userId + dateStr)
                .digest('hex');
            return { word, hash };
        });

        // ハッシュ値に基づいてソートし、上位10件をピックアップ
        wordsWithScores.sort((a, b) => a.hash.localeCompare(b.hash));
        const selected = wordsWithScores.slice(0, 10).map(item => item.word);

        // ユーザー情報を取得して学習情報を追加
        const user = (await prisma.user.findUnique({
            where: { id: userId },
        })) as any;

        return NextResponse.json({
            words: selected,
            study_count: user?.['dailyStudyCount'] || 0,
            last_studied_at: user?.['dailyLastStudiedAt'] || null
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to fetch daily quiz" }, { status: 500 });
    }
}
