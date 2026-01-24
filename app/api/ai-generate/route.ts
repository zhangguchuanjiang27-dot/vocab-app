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
      
      2. **意味の完全・正確な日本語訳（必須）**:
         - **独立した辞書的な日本語を使う**: "profound" なら「深い」「奥深い」「深遠な」など、標準的な日本語を使ってください。
         - **絶対にしてはいけない**:
           - 英単語をそのまま日本語に混ぜる（例: "profoundな" ❌）
           - 不完全な訳（例: "profoundとは" ❌）
           - 説明的な書き方（例: "深さがある" ❌ → "深い" ✓）
           - **「【熟】」や「熟語」というラベルを含めること（例: "【熟】〜" ❌, "熟語: 〜" ❌）**
         - **複数の意味がある場合は列挙**: "【形】①深い ②奥深い ③深遠な" のように番号をつけて整理
         - 品詞タグを明示: 【名】【形】【動】【副】など。**熟語の場合は品詞タグ（【熟】など）を付けず、意味だけを記述してください。**
      
      3. **品詞の指定（partOfSpeech）**:
         - 単一品詞: "形容詞" / "名詞" / "動詞" など。**熟語の場合は「熟語」と指定してください。**
      
      4. **入力処理**: 単語単体で入力された場合は原形に直してください。
      
      各項目について以下の情報を含めてください：
      1. word: 英単語
      2. partOfSpeech: 品詞
      3. meaning: 日本語の意味
      
      出力は以下のJSON形式のみを返してください：
      {
        "words": [
          { 
            "word": "profound", 
            "partOfSpeech": "形容詞", 
            "meaning": "【形】①深い ②奥深い ③深遠な"
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
    const parsed = JSON.parse(data.choices[0].message.content || "{}");

    // レスポンス整形: フロントエンドが期待する形式に変換
    const result = {
      words: (parsed.words || []).map((w: any) => ({
        ...w,
        example: "",
        example_jp: "",
        otherExamples: []
      }))
    };

    // Step 2: Generate examples for each word based on its meanings
    if (result.words.length > 0) {
      try {
        const examplesPrompt = `
          あなたは英語学習のエキスパートです。
          先ほど生成された英単語と意味のリストをもとに、**それぞれの意味に対応する例文**を作成してください。

          【入力データ】
          ${JSON.stringify(result.words, null, 2)}

          【重要：例文作成ルール】
          1. **意味ごとの生成**: 各単語について、"meaning" フィールドに含まれる**すべての異なる意味**に対して、それぞれ1つずつ例文を作ってください。
             - 例: "capital" の意味が "①首都 ②資本 ③主要な" の場合、3つの例文（首都用、資本用、主要な用）を作成。
             - 番号などがなく意味が1つの場合は例文を1つ作成。
          2. **品質**:
             - 文脈が明確で、その意味で使われていることがわかる自然な英語の文（10-15単語程度）。
             - 簡素すぎる文（"This is a pen."など）は不可。
          3. **データ構造**:
             - 各単語の "otherExamples" 配列に格納してください。
             - 各例文は { "role": "品詞", "text": "英文", "translation": "日本語訳" } の形式。
             - role はその意味に対応する品詞（Noun, Verb, Adjective, 熟語 等）。

          出力は以下のJSON形式のみを返してください。入力の "word" をキーにして照合できるようにしてください。
          {
            "details": [
              {
                "word": "capital",
                "otherExamples": [
                  { "role": "Noun", "text": "Tokyo is the capital of Japan.", "translation": "東京は日本の首都です。" },
                  { "role": "Noun", "text": "You need capital to start a business.", "translation": "ビジネスを始めるには資本が必要です。" },
                  { "role": "Adjective", "text": "It was a capital error.", "translation": "それは主要な（致命的な）誤りだった。" }
                ]
              }
            ]
          }
        `;

        const response2 = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a helpful assistant that adds examples to JSON data." },
              { role: "user", content: examplesPrompt },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (response2.ok) {
          const data2 = await response2.json();
          const parsed2 = JSON.parse(data2.choices[0].message.content || "{}");

          // Merge examples into the result
          if (parsed2.details && Array.isArray(parsed2.details)) {
            const examplesMap = new Map(parsed2.details.map((d: any) => [d.word, d.otherExamples]));

            result.words = result.words.map((w: any) => {
              const examples = examplesMap.get(w.word) || [];
              return {
                ...w,
                otherExamples: examples
              };
            });
          }
        }
      } catch (error) {
        console.error("Step 2 (Examples) Error:", error);
        // If step 2 fails, we still return the words from step 1, just without examples matches
      }
    }

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
