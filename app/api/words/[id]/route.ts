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

// 単語の更新（移動・内容編集）
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
        // deckIdは移動用、その他は編集用
        const { deckId, word: wordText, meaning, partOfSpeech, example, example_jp, otherExamples, synonyms, derivatives } = body;

        // 1. 移動・編集対象の単語が自分のものか確認
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

        const updateData: any = {};

        // デッキ移動の場合
        if (deckId) {
            // 移動先のデッキが自分のものか確認
            const targetDeck = await prisma.deck.findUnique({
                where: { id: deckId, userId: session.user.id }
            });

            if (!targetDeck) {
                return NextResponse.json({ error: "Target deck not found or unauthorized" }, { status: 403 });
            }
            updateData.deckId = deckId;
        }

        // 単語内容の編集の場合
        if (wordText !== undefined) updateData.word = wordText;
        if (meaning !== undefined) updateData.meaning = meaning;
        if (partOfSpeech !== undefined) updateData.partOfSpeech = partOfSpeech;
        if (example !== undefined) updateData.example = example;
        if (synonyms !== undefined) updateData.synonyms = JSON.stringify(synonyms);
        if (derivatives !== undefined) updateData.derivatives = JSON.stringify(derivatives);

        // example_jp と otherExamples の処理
        let baseExampleJp = example_jp;
        if (baseExampleJp === undefined) {
            // example_jpが送られてこない場合は既存のものを使う
            baseExampleJp = word.example_jp;
        }

        // 既存の拡張データを除去してベースを取得
        if (baseExampleJp.includes("|||EXT|||")) {
            baseExampleJp = baseExampleJp.split("|||EXT|||")[0];
        }
        if (baseExampleJp.includes("|||UNLOCKED|||")) {
            baseExampleJp = baseExampleJp.replace("|||UNLOCKED|||", "");
        }

        // otherExamplesがある場合（または空配列で送られてきた場合）はシリアライズ
        if (otherExamples !== undefined) {
            const extDataString = JSON.stringify({
                examples: otherExamples
            });
            updateData.example_jp = `${baseExampleJp}|||EXT|||${extDataString}|||UNLOCKED|||`;
        } else if (example_jp !== undefined) {
            // otherExamplesはないがexample_jpだけ更新された場合 (既存の拡張データを維持するか、クリアするか...
            // ここではシンプルにベース部分だけ更新し、既存の拡張データがあれば残すべきだが、
            // 編集フォームから送るときは通常すべて送るはず。
            // 既存の拡張データを保持するロジックを追加
            let existingExt = "";
            if (word.example_jp.includes("|||EXT|||")) {
                const parts = word.example_jp.split("|||EXT|||");
                if (parts.length > 1) existingExt = "|||EXT|||" + parts[1];
            }
            updateData.example_jp = `${baseExampleJp}${existingExt}`;
        }


        // 3. 更新実行
        const updatedWord = await prisma.wordCard.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json(updatedWord);

    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to update word" }, { status: 500 });
    }
}
