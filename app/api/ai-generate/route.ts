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
      以下の英単語・熟語リスト（改行区切り）をもとに、学習用の単語帳データをJSON形式で生成してください。
      
      【重要】
      ユーザーの残りクレジットは ${userCredits} です。
      入力されたリストの項目数がこれより多い場合でも、必ず **最大 ${userCredits} 項目まで** に制限して出力してください。
      リストの上から順に ${userCredits} 個を選んでください。
      
      【重要：処理ルール】
      1. **1行1エントリー**: 入力の1行につき1つのカードを作ってください。文字列の中にスペースが含まれていても、それは「熟語（イディオム）」として扱い、**絶対に分割しないでください**。（例: "broaden one's horizons" は1つの単語として扱う）
      2. **原形への変換**: 単語単体の場合は原形に直してください。熟語の場合も、文法的に自然な見出し語の形（辞書形）に直してください。（例: "running" -> "run", "got up" -> "get up"）
      3. **スペル修正**: 軽微なスペルミスは修正してください。
      4. **不明な単語**: もし「実在しない単語」や「意味不明な文字列」の場合は、その単語の情報を以下のように返してください：
         - word: 元の入力文字列
         - partOfSpeech: "不明"
         - meaning: "UNKNOWN"
         - example: "-"
         - example_jp: "-"
      
      各項目について以下の情報を含めてください：
      1. word: 修正後の英単語または熟語
      2. partOfSpeech: 品詞（名詞, 動詞, 熟語 etc. 日本語で）
      3. meaning: 日本語の核心的な意味（簡潔に）
      4. example: その単語/熟語を使った英語の例文（短くシンプルに）
      5. example_jp: 例文の和訳
      
      出力は以下のJSON形式のみを返してください：
      {
        "words": [
          { "word": "apple", "partOfSpeech": "名詞", "meaning": "りんご", "example": "I ate an apple.", "example_jp": "私はりんごを食べた。" },
          { "word": "get up", "partOfSpeech": "熟語", "meaning": "起きる", "example": "I get up at 7.", "example_jp": "私は7時に起きる。" }
        ]
      }

      対象のリスト:
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
