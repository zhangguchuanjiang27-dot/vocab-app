import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { text } = await req.json();

        const prompt = `
      あなたは英語学習のエキスパートです。
      以下の英単語リスト（改行区切り）をもとに、学習用の単語帳データをJSON形式で生成してください。
      
      各単語について以下の情報を含めてください：
      1. word: 元の英単語
      2. meaning: 日本語の核心的な意味（簡潔に）
      3. example: その単語を使った英語の例文（短くシンプルに）
      4. example_jp: 例文の和訳

      出力は以下のJSON形式のみを返してください：
      {
        "words": [
          { "word": "apple", "meaning": "りんご", "example": "I ate an apple.", "example_jp": "私はりんごを食べた。" }
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
        return NextResponse.json(result);

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Error" }, { status: 500 });
    }
}
