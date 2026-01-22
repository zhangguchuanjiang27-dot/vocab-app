import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;
    const UNLOCK_COST = 2; // コイン消費量

    try {
        // トランザクションで「クレジット消費」と「単語更新」を同時に行う
        const result = await prisma.$transaction(async (tx) => {
            // 1. ユーザーのクレジットを確認
            const user = await tx.user.findUnique({
                where: { id: userId },
            });

            if (!user || user.credits < UNLOCK_COST) {
                throw new Error("Insufficient credits");
            }

            // 2. 単語カードを取得して、所有権と現在の状態を確認
            // WordCardからDeckを経由してUserIdを確認する必要があるが、
            // 簡略化のため、まずは単語を取得し、そのDeckのUserIdを確認する
            const word = await tx.wordCard.findUnique({
                where: { id },
                include: { deck: true }
            });

            if (!word) {
                throw new Error("Word not found");
            }

            if (word.deck.userId !== userId) {
                throw new Error("Unauthorized");
            }

            // すでにアンロック済みかチェック
            if (word.example_jp.includes("|||UNLOCKED|||")) {
                return { success: true, message: "Already unlocked", credits: user.credits };
            }

            // 3. クレジットを減らす
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { credits: { decrement: UNLOCK_COST } },
            });

            // 4. 単語にアンロックフラグを埋め込む
            // 既存の example_jp + マーカー
            await tx.wordCard.update({
                where: { id },
                data: {
                    example_jp: word.example_jp + "|||UNLOCKED|||"
                }
            });

            return { success: true, credits: updatedUser.credits };
        });

        return NextResponse.json(result);

    } catch (err: any) {
        if (err.message === "Insufficient credits") {
            return NextResponse.json({ error: "コインが足りません" }, { status: 403 });
        }
        console.error(err);
        return NextResponse.json({ error: "Failed to unlock" }, { status: 500 });
    }
}
