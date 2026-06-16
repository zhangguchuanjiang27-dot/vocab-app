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

// デッキの更新（単語追加、タイトル変更、学習回数変更など）
export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (id === 'daily-10') {
        try {
            const body = await req.json();
            const { study_count } = body;
            if (study_count !== undefined) {
                const user = await prisma.user.update({
                    where: { id: session.user.id },
                    data: {
                        dailyStudyCount: Number(study_count),
                        dailyLastStudiedAt: new Date()
                    } as any
                }) as any;
                return NextResponse.json({
                    success: true,
                    study_count: user.dailyStudyCount,
                    last_studied_at: user.dailyLastStudiedAt
                });
            }
            return NextResponse.json({ error: "Invalid request for daily-10" }, { status: 400 });
        } catch (err) {
            console.error(err);
            return NextResponse.json({ error: "Failed to update daily study count" }, { status: 500 });
        }
    }

    try {
        const body = await req.json();
        const { words, title, study_count } = body;

        // まずデッキが本人のものか確認
        const deck = await prisma.deck.findUnique({
            where: { id: id, userId: session.user.id }
        });

        if (!deck) {
            return NextResponse.json({ error: "Deck not found" }, { status: 404 });
        }

        const updateData: any = {};

        // タイトル変更のリクエストがある場合
        if (title !== undefined) {
            updateData.title = title;
        }

        // フォルダ移動
        // @ts-ignore
        if (body.folderId !== undefined) {
            // @ts-ignore
            updateData.folderId = body.folderId;
        }

        // 学習回数の変更
        if (study_count !== undefined) {
            updateData.study_count = Number(study_count);
            // 学習回数が0から増えて、かつ最終学習日時が設定されていない場合は今日に設定する
            if (deck.study_count === 0 && Number(study_count) > 0 && !deck.last_studied_at) {
                updateData.last_studied_at = new Date();
            }
        }

        if (Object.keys(updateData).length > 0) {
            const updatedDeck = await prisma.deck.update({
                where: { id },
                data: updateData
            });
            deck.title = updatedDeck.title;
            // @ts-ignore
            deck.folderId = updatedDeck.folderId;
            deck.study_count = updatedDeck.study_count;
            deck.last_studied_at = updatedDeck.last_studied_at;
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
