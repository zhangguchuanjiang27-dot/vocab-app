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
    const GENERATE_COST = 1; // 生成コスト

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Check User Credits
            const user = await tx.user.findUnique({
                where: { id: userId },
            });

            if (!user || user.credits < GENERATE_COST) {
                throw new Error("Insufficient credits");
            }

            // 2. Fetch Word
            const word = await tx.wordCard.findUnique({
                where: { id },
                include: { deck: true }
            });

            if (!word) throw new Error("Word not found");
            if (word.deck.userId !== userId) throw new Error("Unauthorized");

            // 3. Generate content via OpenAI
            const prompt = `
            英単語「${word.word}」の意味は「${word.meaning}」です。
            この単語について、以下の情報をJSONで生成してください。
            
            1. otherExamples: この単語を使った、メインの例文とは異なるニュアンスや使い方の例文（1つ）。
               - 例文がない場合は無理に作らず空配列でもよいが、できるだけ作成してください。
               - 形式: { "role": "形容詞", "text": "...", "translation": "..." }
            2. synonyms: 類義語（1〜3個）
            3. antonyms: 対義語（1〜2個）

            既存の例文: ${word.example}
            これとは違う例文にしてください。

            出力JSON形式:
            {
               "examples": [ { "role": "...", "text": "...", "translation": "..." } ],
               "synonyms": ["...", "..."],
               "antonyms": ["..."]
            }
            `;

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "You are a helpful assistant that outputs JSON." },
                        { role: "user", content: prompt },
                    ],
                    response_format: { type: "json_object" },
                }),
            });

            if (!response.ok) throw new Error("OpenAI API Error");

            const aiData = await response.json();
            const content = JSON.parse(aiData.choices[0].message.content || "{}");

            // 4. Update Word
            // 既存の example_jp にマーカーとJSONを追記
            // すでにEXTがある場合は一度削除するか、追記するかだが、ここでは「ない場合」を想定して追記
            // また、生成した時点で「アンロック済み」とする（|||UNLOCKED|||）

            let newExampleJp = word.example_jp;
            // 既存のEXTタグがあれば除去（念のため）
            if (newExampleJp.includes("|||EXT|||")) {
                newExampleJp = newExampleJp.split("|||EXT|||")[0];
            }
            // 既存のUNLOCKEDタグがあれば除去
            if (newExampleJp.includes("|||UNLOCKED|||")) {
                newExampleJp = newExampleJp.replace("|||UNLOCKED|||", "");
            }

            const extDataString = JSON.stringify({
                examples: content.examples || [],
                synonyms: content.synonyms || [],
                antonyms: content.antonyms || []
            });

            newExampleJp = `${newExampleJp}|||EXT|||${extDataString}|||UNLOCKED|||`;

            const updatedWord = await tx.wordCard.update({
                where: { id },
                data: { example_jp: newExampleJp }
            });

            // 5. Deduct Credits
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { credits: { decrement: GENERATE_COST } }
            });

            return {
                success: true,
                credits: updatedUser.credits,
                word: updatedWord,
                generatedContent: content
            };
        });

        return NextResponse.json(result);

    } catch (err: any) {
        console.error(err);
        if (err.message === "Insufficient credits") {
            return NextResponse.json({ error: "コインが足りません" }, { status: 403 });
        }
        return NextResponse.json({ error: "Failed to generate details" }, { status: 500 });
    }
}
