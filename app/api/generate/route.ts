import { NextResponse } from "next/server";
// Trigger redeploy
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that outputs JSON." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const responseContent = completion.choices[0].message.content;
    return NextResponse.json(JSON.parse(responseContent || "{}"));

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}