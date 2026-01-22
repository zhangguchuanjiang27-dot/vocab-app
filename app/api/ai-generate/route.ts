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
      1. **1行1エントリー**: 入力の1行につき1つのカードを作ってください。文字列の中にスペースが含まれていても、それは「熟語（イディオム）」として扱い、**絶対に分割しないでください**。
      2. **意味の完全網羅**: その単語の**重要な意味はすべて**列挙してください。「名詞の中で意味が複数ある場合」もすべて含めます。（例: capital -> 首都, 資本, 大文字）
         - 意味フォーマット: "【名】①首都 ②資本 【形】主要な" のように、品詞タグと番号を使って整理する。
      3. **例文の生成ルール（厳守）**:
         - **単語の形**: 入力された単語そのものを使ってください。
           - **NG**: 品詞が変わる派生語（例: kind -> kindness, safe -> safety）
           - **OK**: 動詞の活用（-ed, -ing, -s）、名詞の複数形、形容詞の比較級
         - **意味の分担（重複禁止）**:
           - example (メイン): その単語の**最も頻度が高い代表的な意味**を1つだけ選んで作ってください。
           - otherExamples (追加): **メインで使わなかった残りの**重要な意味について作ってください。メインと同じ意味の例文は絶対に含めないでください。
         - otherExamples の role には、"名詞(種類)" のように**品詞と意味**を明記してください。
      4. **原形への変換**: 単語単体で入力された場合は原形に直してください（例文内では活用してOK）。
      
      各項目について以下の情報を含めてください：
      1. word: 修正後の英単語または熟語
      2. partOfSpeech: 品詞（重要なものが複数ある場合は "/ " で区切って列挙）
      3. meaning: 日本語の意味（"【名】①... ②..." のように記述）
      4. example: 最も頻度の高い意味を使った英語の例文（1文）
      5. example_jp: 例文の和訳
      6. otherExamples: **残りの**重要な意味をカバーする追加例文リスト
         - role: "名詞(種類)", "形容詞(親切な)" などの形式
         - text: 英語の例文
         - translation: 和訳
      
      出力は以下のJSON形式のみを返してください：
      {
        "words": [
          { 
            "word": "capital", 
            "partOfSpeech": "名詞 / 形容詞", 
            "meaning": "【名】①首都 ②資本 ③大文字 【形】主要な", 
            "example": "Tokyo is the capital of Japan.", 
            "example_jp": "東京は日本の首都だ。",
            "otherExamples": [
              { "role": "名詞(資本)", "text": "We need more capital to start the business.", "translation": "事業を始めるにはもっと資本が必要だ。" },
              { "role": "名詞(大文字)", "text": "Write your name in capital letters.", "translation": "名前を大文字で書きなさい。" },
              { "role": "形容詞(主要な)", "text": "It was a capital error.", "translation": "それは主要なミスだった。" }
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
