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
         - **複数の意味がある場合は列挙**: "【形】①深い ②奥深い ③深遠な" のように番号をつけて整理
         - 品詞タグを明示: 【名】【形】【動】【副】など
      
      3. **品詞の指定（partOfSpeech）**:
         - 単一品詞: "形容詞" / "名詞" / "動詞" など
         - 複数品詞: "名詞 / 形容詞" のようにスラッシュで区切る
      
      4. **例文の生成ルール（厳守）**:
         - **単語の形**: 入力された単語そのものを使ってください。（活用形はOKですが、品詞が変わる派生語は避けてください）
         - **正しい語法**: その単語が辞書的に持つ**正しい品詞と意味**のみを使ってください。
           - **NG**: 'kind' を名詞の「親切(=kindness)」として使う（これは文法的に誤りなので禁止）。名詞なら「種類」のみ。
         - **意味の重複排除（最重要）**:
           - example (メイン): 最も頻度が高い意味を1つ選んでください。
           - otherExamples (追加): **メインの意味とは「概念的に異なる」別の意味**だけを生成してください。
             - メインで「深い(adj)」を使ったら、詳細には「深さ」に関連するものは一切含めないでください。
             - もし別の意味が存在しない場合は、無理に生成せず空リストにしてください。
      
      5. **入力処理**: 単語単体で入力された場合は原形に直してください。
      
      各項目について以下の情報を含めてください：
      1. word: 英単語
      2. partOfSpeech: 品詞（例: "名詞"、"形容詞"、"名詞 / 形容詞"）
      3. meaning: 日本語の意味（"【形】①深い ②奥深い" など、必ず日本語のみ）
      4. example: メインの例文（1文）
      5. example_jp: 例文の和訳
      6. otherExamples: **重複しない**追加の例文リスト（なければ空）
         - role: "形容詞(奥深い)" の形式
         - text: 英語の例文
         - translation: 和訳
      7. synonyms: 類義語の英単語リスト（例: ["deep", "profound"]）- 3個程度まで
      8. antonyms: 対義語の英単語リスト（例: ["shallow"]）- 1～2個程度
      
      出力は以下のJSON形式のみを返してください：
      {
        "words": [
          { 
            "word": "profound", 
            "partOfSpeech": "形容詞", 
            "meaning": "【形】①深い ②奥深い ③深遠な", 
            "example": "She has a profound understanding of the subject.", 
            "example_jp": "彼女はその主題について深い理解を持っている。",
            "otherExamples": [
              { "role": "形容詞(奥深い)", "text": "His words had a profound impact on me.", "translation": "彼の言葉は私に深い影響を与えた。" }
            ],
            "synonyms": ["deep", "serious"],
            "antonyms": ["shallow", "superficial"]
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
