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
      2. **多義語の扱い**: その単語に**複数の重要な品詞や意味**がある場合（TOEICや受験で頻出な場合）、**1つのカードにまとめて**出力してください。
         - 品詞: "形容詞 / 名詞" のようにスラッシュ区切り
         - 意味: "【形】必須の 【名】命令" のように、どの品詞の意味か分かるように書く
         - **他の例文**: メインの例文以外に、他の品詞や意味に対応する例文があれば \`otherExamples\` 配列に入れてください。

      3. **原形への変換**: 単語単体の場合は原形に直してください。
      4. **スペル修正**: 軽微なスペルミスは修正してください。
      
      各項目について以下の情報を含めてください：
      1. word: 修正後の英単語または熟語
      2. partOfSpeech: 品詞（重要なものが複数ある場合は "/ " で区切って列挙）
      3. meaning: 日本語の意味（多義語の場合は "【形】... 【名】..." のように区別して記述）
      4. example: 代表的な意味を使った英語の例文（1文）
      5. example_jp: 例文の和訳
      6. otherExamples: 追加例文の配列（なければ空配列）
         - role: 役割や品詞（例: "名詞", "医学用語"）
         - text: 英語の例文
         - translation: 和訳
      
      出力は以下のJSON形式のみを返してください：
      {
        "words": [
          { 
            "word": "imperative", 
            "partOfSpeech": "形容詞 / 名詞", 
            "meaning": "【形】必須の 【名】命令", 
            "example": "It is imperative that we act now.", 
            "example_jp": "今すぐ行動することが必須だ。",
            "otherExamples": [
              { "role": "名詞", "text": "It is a moral imperative.", "translation": "それは道徳的な至上命令だ。" }
            ]
          }
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
