import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check credits
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { credits: true }
    });

    const userCredits = user?.credits ?? 0;

    if (!user || userCredits <= 0) {
        return NextResponse.json(
            { error: "Insufficient credits", type: "credit_limit" },
            { status: 403 }
        );
    }

    try {
        const { text } = await req.json();

        const prompt = `
      あなたは英語学習のエキスパートです。
      以下の英単語リスト（改行区切り）をもとに、学習用の単語帳データをJSON形式で生成してください。
      
      【重要】
      ユーザーの残りクレジットは ${userCredits} です。
      入力された単語の数がこれより多い場合でも、必ず **最大 ${userCredits} 個まで** に制限して出力してください。
      リストの上から順に ${userCredits} 個を選んでください。
      
      【重要：前処理ルール】
      1. **原形への変換**: 入力された単語が変化形（過去形、複数形、進行形など）の場合、**必ず原形（辞書の見出し語）**に直してください。（例: running -> run, cats -> cat）
      2. **スペル修正**: 軽微なスペルミスは修正してください。（例: aple -> apple）
      3. **不明な単語**: もし「実在しない単語」や「意味不明な文字列」の場合は、その単語の情報を以下のように返してください：
         - word: 元の入力文字列
         - partOfSpeech: "不明"
         - meaning: "UNKNOWN"
         - example: "-"
         - example_jp: "-"
      
      各単語について以下の情報を含めてください：
      1. word: 修正後の英単語（原形）
      2. partOfSpeech: 品詞（名詞, 動詞, 形容詞, 副詞 etc. 日本語で）
      3. meaning: 日本語の核心的な意味（簡潔に）
      4. example: その単語を使った英語の例文（短くシンプルに）
      5. example_jp: 例文の和訳
      
      出力は以下のJSON形式のみを返してください：
      {
        "words": [
          { "word": "apple", "partOfSpeech": "名詞", "meaning": "りんご", "example": "I ate an apple.", "example_jp": "私はりんごを食べた。" },
          { "word": "dsjfkl", "partOfSpeech": "不明", "meaning": "UNKNOWN", "example": "-", "example_jp": "-" }
        ]
      }

      対象の単語リスト:
      ${text}
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

        if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content || "{}");

        const generatedCount = result.words ? result.words.length : 0;

        // Deduct credits based on the number of words generated
        if (generatedCount > 0) {
            await prisma.user.update({
                where: { id: session.user.id },
                data: { credits: { decrement: generatedCount } }
            });
        }

        return NextResponse.json(result);

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Error" }, { status: 500 });
    }
}
