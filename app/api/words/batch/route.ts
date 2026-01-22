import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

// 単語の一括移動
export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { wordIds, targetDeckId } = body;

        if (!Array.isArray(wordIds) || wordIds.length === 0) {
            return NextResponse.json({ error: "No words selected" }, { status: 400 });
        }

        if (!targetDeckId) {
            return NextResponse.json({ error: "Target deck required" }, { status: 400 });
        }

        // 1. 移動先のデッキが自分のものか確認
        const targetDeck = await prisma.deck.findUnique({
            where: { id: targetDeckId, userId: session.user.id }
        });

        if (!targetDeck) {
            return NextResponse.json({ error: "Target deck not found or unauthorized" }, { status: 403 });
        }

        // 2. 更新実行
        // wordIdsに含まれ、かつ所有者が自分である単語のみ更新する（セキュリティ対策）
        const result = await prisma.wordCard.updateMany({
            where: {
                id: { in: wordIds },
                deck: {
                    userId: session.user.id
                }
            },
            data: {
                deckId: targetDeckId
            }
        });

        return NextResponse.json({ success: true, count: result.count });

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to batch move words" }, { status: 500 });
    }
}
