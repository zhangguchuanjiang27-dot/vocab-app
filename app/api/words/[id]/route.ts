import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

// 単語の削除
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const word = await prisma.wordCard.findUnique({
            where: { id },
            include: { deck: true }
        });

        if (!word) {
            return NextResponse.json({ error: "Word not found" }, { status: 404 });
        }

        if (word.deck.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        await prisma.wordCard.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to delete word" }, { status: 500 });
    }
}

// 単語の更新（移動など）
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await req.json();
        const { deckId } = body;

        if (!deckId) {
            return NextResponse.json({ error: "Target deckId is required" }, { status: 400 });
        }

        // 1. 移動先のデッキが自分のものか確認
        const targetDeck = await prisma.deck.findUnique({
            where: { id: deckId, userId: session.user.id }
        });

        if (!targetDeck) {
            return NextResponse.json({ error: "Target deck not found or unauthorized" }, { status: 403 });
        }

        // 2. 移動元の単語が自分のものか確認
        const word = await prisma.wordCard.findUnique({
            where: { id },
            include: { deck: true }
        });

        if (!word) {
            return NextResponse.json({ error: "Word not found" }, { status: 404 });
        }

        if (word.deck.userId !== session.user.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        // 3. 更新実行
        const updatedWord = await prisma.wordCard.update({
            where: { id },
            data: { deckId }
        });

        return NextResponse.json(updatedWord);

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to update word" }, { status: 500 });
    }
}
