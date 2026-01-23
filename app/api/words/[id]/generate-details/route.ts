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
        Task: Comprehensive Example Generation for "${word.word}"
        
        User's provided meaning: "${word.meaning}"

        Instructions:
        1. **Analyze User's Meaning**: Carefully break down the user's provided meaning ("${word.meaning}") into distinct meanings.
        2. **Generate Examples**: Create one example sentence for **EACH** distinct meaning identified from the user's input.
           - **Rule**: If the user provides 3 distinct meanings (e.g., ①... ②... ③...), you MUST generate exactly 3 examples, one for each.
           - **Rule**: If the user provides only 1 meaning, generate 1 example.
           - **Quality Control**: 
             - Sentences **MUST** be at least 10-15 words long.
             - Sentences **MUST** be context-rich and clear.
             - **BAD**: "He ran fast." (Too short, ambiguous)
             - **GOOD**: "He ran fast enough to catch the bus just moments before it pulled away from the station." (Context-rich, clear)
           - Use your knowledge to identify parts of speech if they are implied, but prioritize the user's categorization.
        4. **Role Format**: The "role" must strictly follow the format: "Part of Speech (Specific Meaning)" (e.g., "Verb (to run)", "Noun (a run)").

        Output JSON Format:
        {
          "examples": [
            {
              "role": "Part of Speech (Specific Meaning)",
              "text": "English example sentence (10-15+ words)",
              "translation": "Japanese translation"
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
