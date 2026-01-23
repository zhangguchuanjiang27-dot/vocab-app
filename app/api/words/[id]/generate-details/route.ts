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
            
            1. weather
               - この単語「${word.word}」について、例文を**複数（3〜5個）**生成してください。
               
               【生成ルール】
               1. まず、ユーザーが登録した意味「${word.meaning}」を分析し、そこに含まれる意味ごとに例文を作ってください。
               2. 次に、**異なる品詞（名詞、動詞、形容詞、副詞など）**の意味がこの単語にあるか確認し、あれば必ずそれらを含めてください。（例: "capital"なら「首都(名詞)」だけでなく「主要な(形容詞)」「大文字の(形容詞)」なども含める）
               3. これらを合わせて、**合計3〜5個**の多様な例文セットになるようにしてください。似たような意味ばかりにならないよう注意してください。
               4. **必ず複数の例文配列**を返してください。1つだけで終わらせないでください。

               - **重要**: roleは必ず**【品詞（具体的な意味）】**の形式で出力してください。
                 - 例: "動詞（走る）", "名詞（競走）"
               - **重要**: 単語単体（例: "run"）の場合、その単語自体の意味の例文のみを生成してください。熟語（phrasal verbs等）は含めないでください。
               - 形式: { "role": "...", "text": "英文", "translation": "和訳" }

            出力JSON形式（例）:
            {
               "examples": [ 
                  { "role": "動詞(走る)", "text": "...", "translation": "..." },
                  { "role": "動詞(経営する)", "text": "...", "translation": "..." },
                  { "role": "名詞(競走)", "text": "...", "translation": "..." }
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
