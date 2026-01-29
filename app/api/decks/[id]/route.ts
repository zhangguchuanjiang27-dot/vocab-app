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

// デッキの更新（単語追加 または タイトル変更）
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
        const { words, title } = body;

        // まずデッキが本人のものか確認
        const deck = await prisma.deck.findUnique({
            where: { id: id, userId: session.user.id }
        });

        if (!deck) {
            return NextResponse.json({ error: "Deck not found" }, { status: 404 });
        }

        // タイトル変更のリクエストがある場合
        if (title !== undefined) {
            await prisma.deck.update({
                where: { id },
                data: { title }
            });
        }

        // フォルダ移動
        // @ts-ignore
        if (body.folderId !== undefined) {
            // @ts-ignore
            await prisma.deck.update({
                where: { id },
                // @ts-ignore
                data: { folderId: body.folderId }
            });
        }

        // 単語追加のリクエストがある場合
        if (words && Array.isArray(words) && words.length > 0) {
            // データ変換：拡張データをexample_jpに埋め込む
            const newWordsData = words.map((w: any) => {
                let exampleJp = w.example_jp || "";

                // 拡張データを構築
                // 拡張データを構築
                const extData = {
                    examples: w.otherExamples || []
                };

                if (extData.examples.length > 0) {
                    // 区切り文字を使ってJSONを埋め込む
                    // 既存のEXTタグがあれば除去してから追記（重複防止）
                    if (exampleJp.includes("|||EXT|||")) {
                        exampleJp = exampleJp.split("|||EXT|||")[0];
                    }
                    exampleJp += `|||EXT|||${JSON.stringify(extData)}`;
                }

                return {
                    word: w.word,
                    partOfSpeech: w.partOfSpeech || null,
                    meaning: w.meaning,
                    example: w.example || "",
                    example_jp: exampleJp,
                    deckId: id,
                    synonyms: w.synonyms || undefined,
                    derivatives: w.derivatives || undefined
                };
            });

            await prisma.wordCard.createMany({
                data: newWordsData
            });

            return NextResponse.json({ success: true, added: newWordsData.length, titleUpdated: !!title });
        }

        return NextResponse.json({ success: true, titleUpdated: !!title });

    } catch (err) {
        console.error(err);
        return NextResponse.json({
            error: `Failed to update deck: ${err instanceof Error ? err.message : String(err)}`
        }, { status: 500 });
    }
}
