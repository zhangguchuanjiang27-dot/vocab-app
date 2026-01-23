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
    // 1. (Skipped credit check)

    try {
        // 2. Fetch Word
        const word = await prisma.wordCard.findUnique({
            where: { id },
            include: { deck: true }
        });

        if (!word) throw new Error("Word not found");
        if (word.deck.userId !== userId) throw new Error("Unauthorized");

        // 3. Generate content via OpenAI
        const prompt = `
            英単語「${word.word}」の意味は「${word.meaning}」です。
            この単語について、以下の情報をJSONで生成してください。
            
            1. examples:
               - この単語「${word.word}」が持つ主要な意味・ニュアンスについて、**最大5つまで**分類して例文を生成してください。
               - **ユーザーが登録した意味「${word.meaning}」は最も重要なので、必ず最初の1つ目に含めてください。**
               - それ以外にもこの単語の一般的・重要な意味があれば、追加で含めてください（合計5つ以内）。
               - 意味が5つ以上ある場合は頻出度が高いものを優先してください。少ない場合は無理に増やさずその数だけで構いません。
               - **重要**: roleは必ず**【品詞（具体的な意味）】**の形式で出力してください。
                 - 例: "動詞（走る）", "名詞（競走）"
               - **重要**: 単語単体（例: "run"）の場合、その単語自体の意味の例文のみを生成してください。熟語（phrasal verbs等）は含めないでください。
               - 形式: { "role": "...", "text": "英文", "translation": "和訳" }

            出力JSON形式:
            {
               "examples": [ 
                  { "role": "名詞(種類)", "text": "...", "translation": "..." },
                  { "role": "形容詞(親切な)", "text": "...", "translation": "..." }
               ]
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
        let newExampleJp = word.example_jp;
        if (newExampleJp.includes("|||EXT|||")) {
            newExampleJp = newExampleJp.split("|||EXT|||")[0];
        }
        if (newExampleJp.includes("|||UNLOCKED|||")) {
            newExampleJp = newExampleJp.replace("|||UNLOCKED|||", "");
        }

        const extDataString = JSON.stringify({
            examples: content.examples || []
        });

        newExampleJp = `${newExampleJp}|||EXT|||${extDataString}|||UNLOCKED|||`;

        const updatedWord = await prisma.wordCard.update({
            where: { id },
            data: { example_jp: newExampleJp }
        });

        // Return result
        return NextResponse.json({
            success: true,
            // credits: 0, // No credits deducted
            word: updatedWord,
            generatedContent: content
        });

    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: "Failed to generate details" }, { status: 500 });
    }
}
