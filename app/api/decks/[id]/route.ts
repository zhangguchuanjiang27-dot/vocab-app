import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

// 単一のデッキを取得する
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const deck = await prisma.deck.findUnique({
            where: {
                id: id,
                userId: session.user.id
            },
            include: {
                words: {
                    orderBy: { createdAt: 'asc' } // 作成順などで並べる
                }
            }
        });

        if (!deck) {
            return NextResponse.json({ error: "Deck not found" }, { status: 404 });
        }

        return NextResponse.json(deck);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to fetch deck" }, { status: 500 });
    }
}

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
        const result = await prisma.deck.deleteMany({
            where: {
                id: id,
                userId: session.user.id
            }
        });

        if (result.count === 0) {
            return NextResponse.json({ error: "Deck not found or unauthorized" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to delete deck" }, { status: 500 });
    }
}

// 既存のデッキに単語を追加する
export async function PUT(
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
        const { words } = body;

        if (!Array.isArray(words)) {
            return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
        }

        // まずデッキが本人のものか確認
        const deck = await prisma.deck.findUnique({
            where: { id: id, userId: session.user.id }
        });

        if (!deck) {
            return NextResponse.json({ error: "Deck not found" }, { status: 404 });
        }

        // 単語を一括追加
        // createMany はSQLiteなどで非対応の場合があるがPostgresならOK
        // WordInput型はあちらのファイルにあるがこちらで再定義か似た形にする
        const newWordsData = words.map((w: any) => ({
            word: w.word,
            partOfSpeech: w.partOfSpeech || null,
            meaning: w.meaning,
            example: w.example || "",
            example_jp: w.example_jp || "",
            deckId: id
        }));

        await prisma.wordCard.createMany({
            data: newWordsData
        });

        return NextResponse.json({ success: true, added: newWordsData.length });

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to update deck" }, { status: 500 });
    }
}
