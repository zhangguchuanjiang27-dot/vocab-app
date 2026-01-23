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
            英単語: ${word.word}
            ユーザーの定義した意味: ${word.meaning}

            以下の指示に従ってJSONを生成してください:
            1. この単語の**異なる3つの意味・用法**を選んでください。
               - 1つ目は必ず「ユーザーの定義した意味」にしてください。
               - 2つ目と3つ目は、この単語の他の一般的な意味（品詞違いなど）を選んでください。
            2. それぞれの意味について、1つずつ例文を作成してください（合計3つ）。

            出力形式:
            {
               "examples": [ 
                  { "role": "品詞(具体的な意味)", "text": "英文", "translation": "和訳" },
                  { "role": "品詞(別の意味)", "text": "英文", "translation": "和訳" },
                  { "role": "品詞(さらに別の意味)", "text": "英文", "translation": "和訳" }
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
