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

    // Parse body
    const body = await req.json().catch(() => ({}));
    const type = body.type || "all"; // "all" (synonyms+derivatives) or "synonyms" (regenerate synonyms)

    // Credit Check (Always 1 coin for now as per requirements)
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true }
    });
    if (!user || user.credits < 1) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 403 });
    }

    try {
        // Fetch Word
        const word = await prisma.wordCard.findUnique({
            where: { id },
            include: { deck: true }
        });

        if (!word) throw new Error("Word not found");
        if (word.deck.userId !== userId) throw new Error("Unauthorized");

        // Construct Prompt
        let prompt = "";
        if (type === "all") {
            prompt = `
            単語 "${word.word}" (意味: ${word.meaning}) について、以下のリストを作成してください。

            1. **類義語 (Synonyms)**: 3つ（必須ではないが、あれば3つ）。
            2. **派生語 (Derivatives)**: 存在するものを全て。

            出力は以下のJSON形式のみで返してください。
            {
              "synonyms": [
                { "word": "単語", "partOfSpeech": "品詞(例えば 形、名、副など)", "meaning": "意味" }
              ],
              "derivatives": [
                { "word": "単語", "partOfSpeech": "品詞", "meaning": "意味" }
              ]
            }
            `;
        } else if (type === "synonyms") {
            prompt = `
            単語 "${word.word}" (意味: ${word.meaning}) の **類義語** を3つ提案してください。
            前回とは異なるものを優先してください。

            出力形式:
            {
              "synonyms": [
                 { "word": "単語", "partOfSpeech": "品詞", "meaning": "意味" }
              ]
            }
            `;
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are a vocabulary assistant. Output JSON only." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.7,
                response_format: { type: "json_object" },
            }),
        });

        if (!response.ok) throw new Error("OpenAI API Error");

        const aiData = await response.json();
        const content = JSON.parse(aiData.choices[0].message.content || "{}");

        // Update DB
        const updateData: any = {};
        if (content.synonyms) updateData.synonyms = content.synonyms;
        if (content.derivatives) updateData.derivatives = content.derivatives;

        // Deduct credit only if successful
        await prisma.user.update({
            where: { id: userId },
            data: { credits: { decrement: 1 } }
        });

        const updatedWord = await prisma.wordCard.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({
            success: true,
            word: updatedWord,
            credits: user.credits - 1
        });

    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: "Failed to generate extras" }, { status: 500 });
    }
}
