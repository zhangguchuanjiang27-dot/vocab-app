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
        Task: Generate vocabulary examples for the English word "${word.word}".
        
        User's Definition: "${word.meaning}"

        Instructions:
        1. **Analyze the User's Definition**: It may contain multiple meanings (e.g., "run, manage"). Split them into distinct concepts.
        2. **Select Target Meanings**: 
           - Use the meanings from the User's Definition first.
           - If there are fewer than 3 meanings, add other common meanings (different parts of speech like Noun/Verb/Adj) to reach a total of **3 distinct meanings**.
           - If there are more than 3, select the top 3 most important ones.
           - **STRICTLY LIMIT to 3 items.**
        3. **Generate Examples**:
           - Create EXACTLY ONE example sentence for EACH of the 3 selected meanings.
           - Ensure the "role" field contains ONLY the specific part of speech and meaning being used in that example (e.g., "Verb (to run)" NOT "Verb (to run, to manage)").

        Output JSON Format:
        {
          "examples": [
            {
              "role": "Part of Speech (Specific Meaning)",
              "text": "English example sentence covering this specific meaning",
              "translation": "Japanese translation of the example"
            }
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
                    { role: "system", content: "You are a helpful assistant that generates JSON data." },
                    { role: "user", content: prompt },
                ],
                temperature: 0.3,
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
