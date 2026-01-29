import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { addXp } from "@/lib/gamification";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check credits & Subscription
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      credits: true,
      // @ts-ignore: New fields might not be in generated client yet
      subscriptionPlan: true,
      // @ts-ignore
      subscriptionStatus: true
    }
  });

  const userCredits = user?.credits ?? 0;
  // @ts-ignore
  const isUnlimited = user?.subscriptionPlan === "unlimited" && user?.subscriptionStatus === "active";

  // 無制限プランでない場合のみクレジット残高チェック
  if (!user || (!isUnlimited && userCredits <= 0)) {
    return NextResponse.json(
      { error: "Insufficient credits", type: "credit_limit" },
      { status: 403 }
    );
  }

  try {
    const { wordText, idiomText, text } = await req.json();
    const inputForNormalization = `
【単語リスト】
${wordText || text || ""}

【熟語リスト】
${idiomText || ""}
    `.trim();

    // Step 0: 入力テキストをAIで解析し、単語の「原形（辞書形）」のリストに変換する
    const normalizationPrompt = `
      あなたは言語学のエキスパートです。
      提供されたテキストから英単語や熟語を抽出し、すべて「原形（辞書形・単数形）」に直してリスト化してください。
      
      【入力形式の解釈ルール】
      提供されたテキストは**改行区切り**のリストです。以下のルールを厳守してください。

      1. **1行 = 1エントリー**: 改行で区切られた各行を、それぞれ独立した1つの項目として扱ってください。
      2. **スペースを含む行は熟語**: 行の中にスペースが含まれている場合（例: "look after", "human rights", "climate change"）は、**その行全体で1つの熟語や複合語**として扱ってください。
         ❌ 絶対に分割してはいけません（例: "look after" -> "look", "after" とするのはNG）。
      3. **スペースを含まない行は単語**: 行の中にスペースがない場合（例: "apple"）は、単一の単語として扱ってください。

      【正規化ルール】
      1. **動詞**: 過去形・進行形・三人称単数などは、すべて「現在形の原形」にする。
         例: played -> play, swimming -> swim, goes -> go
      2. **名詞**: 複数形は「単数形」にする。
         例: apples -> apple
      3. **重複排除**: 完全に重複する項目は1つにまとめる。
      4. **クレンジング**: 明らかなゴミデータ（記号のみなど）は除外する。

      【出力形式】
      {
        "lemmas": ["refresher training", "apple", "play", "study", "look after"]
      }

      テキスト:
      ${inputForNormalization.slice(0, 1500)}
    `;

    let uniqueWords: string[] = [];

    try {
      const normResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful assistant that outputs JSON." },
            { role: "user", content: normalizationPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!normResponse.ok) throw new Error("Normalization API failed");

      const normData = await normResponse.json();
      const normParsed = JSON.parse(normData.choices[0].message.content || "{}");

      if (normParsed.lemmas && Array.isArray(normParsed.lemmas)) {
        uniqueWords = normParsed.lemmas.map((w: string) => w.toLowerCase());
      } else {
        // AI失敗時のフォールバック
        const rawLines = ((wordText || "") + "\n" + (idiomText || "")).split(/[\n,]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        const fallbackSet = new Set<string>();
        rawLines.forEach((line: string) => {
          const clean = line.replace(/^[\d\-\.\s]+/, "").trim().toLowerCase();
          if (clean) fallbackSet.add(clean);
        });
        uniqueWords = Array.from(fallbackSet);
      }

    } catch (e) {
      console.error("Normalization Error:", e);
      // エラー時はフォールバック
      const rawLines = ((wordText || "") + "\n" + (idiomText || "")).split(/[\n,]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      const fallbackSet = new Set<string>();
      rawLines.forEach((line: string) => {
        const clean = line.replace(/^[\d\-\.\s]+/, "").trim().toLowerCase();
        if (clean) fallbackSet.add(clean);
      });
      uniqueWords = Array.from(fallbackSet);
    }

    // 元々のMapロジックは不要になるので削除し、APIに投げる用のマッピングを単純化
    // (AIが正規化した単語をそのまま使う)
    const normalizedWordsMap = new Map<string, string>();
    uniqueWords.forEach(w => normalizedWordsMap.set(w, w));

    if (uniqueWords.length === 0) {
      return NextResponse.json({ words: [] });
    }

    // 2. キャッシュ(辞書)を検索
    // @ts-ignore
    const cachedEntries = await prisma.dictionaryEntry.findMany({
      where: {
        word: { in: uniqueWords }
      }
    });

    // キャッシュにあった単語データ
    // @ts-ignore
    // @ts-ignore
    const foundWordsData = cachedEntries.map((entry: any) => entry.data);
    const foundWordsSet = new Set(cachedEntries.map((entry: any) => entry.word));

    // 3. キャッシュになかった単語を特定
    const missingWords = uniqueWords.filter(w => !foundWordsSet.has(w));

    // APIに投げる用のテキスト（オリジナル表記に戻す）
    const missingWordsText = missingWords.map(w => normalizedWordsMap.get(w)).join("\n");

    let newWordsData: any[] = [];

    // 4. 足りない単語があればAPI生成
    if (missingWords.length > 0) {

      // クレジット足りてるか再確認 (足りない分だけで計算。無制限プランなら無視)
      if (!isUnlimited && userCredits < missingWords.length) {
        return NextResponse.json(
          { error: `Insufficient credits. You need ${missingWords.length} credits but have ${userCredits}.`, type: "credit_limit" },
          { status: 403 }
        );
      }

      const prompt = `
          あなたは英語学習のエキスパートです。
          リストされた英単語について、以下の形式でJSONを生成してください。
          
          【品詞ラベルのルール】
          品詞(partOfSpeech)は必ず以下の1文字の略称に統一してください：
          - 動詞 → 動
          - 名詞 → 名
          - 形容詞 → 形
          - 副詞 → 副
          - 前置詞/接続詞/代名詞 → 他
          - 熟語/句動詞 → 熟

          【出力形式】
          - word: 英単語
          - partOfSpeech: 上記の略称（例: 動, 名, 形）
          - meaning: 日本語の意味。形式は「【略称】意味1、意味2...」としてください。
            **重要: 英単語やカタカナ英語（英語の読みをそのままカタカナにしたもの）は絶対に含めないでください。純粋な日本語訳のみを出力してください。**
            例: "create" なら "【動】作る、創造する" (× "【動】クリエイト")
          
          【制約】
          - 最大 ${missingWords.length} 項目。
          - meaningには英単語（例: casting）またカタカナ英語（例: キャスト）を含めないこと。
          - 返却は以下のJSON構造のみ：
          {
            "words": [
              { "word": "create", "partOfSpeech": "動", "meaning": "【動】作る、創造する、創出する" }
            ]
          }
    
          リスト:
          ${missingWordsText}
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

      // 整形
      newWordsData = (parsed.words || []).map((w: any) => ({
        ...w,
        example: "",
        example_jp: "",
        otherExamples: []
      }));

      // Step 2: Generate specific examples for new words
      if (newWordsData.length > 0) {
        try {
          const examplesPrompt = `
                  以下の単語と意味のリストをもとに、**それぞれの意味（日本語）に対応する例文**を1つずつ作成してください。
        
                  【入力データ】
                  ${JSON.stringify(newWordsData, null, 2)}
        
                  【作成ルール】
                  1. **意味の完全分割**: "meaning" に複数の意味が含まれている場合（例: "【動】作る、創造する"）、**必ずそれぞれの意味ごとに個別の項目を作成**してください。
                     ❌ 絶対にやってはいけない: role: "動詞(作る、創造する)" のようにまとめること。
                     ✅ 正しい出力: role: "動詞(作る)" と role: "動詞(創造する)" の2つの項目に分ける。

                  2. **roleの形式**: 必ず **「品詞(単一の意味)」** としてください。
                     ※品詞は (動詞、名詞、形容詞、副詞、熟語、他) のように、略さず正式名称で書いてください。
                     例: "名詞(首都)", "動詞(作る)", "形容詞(重要な)"
                     
                  3. **網羅性**: 入力データのすべての主要な意味・品詞に対して、例文を生成してください。

                  4. **品質**: 自然で実用的な英語（10-15語以上）。
                  
                  5. **和訳の制約**: 和訳には **絶対に英単語やカタカナ英語を含めないでください**。完全に日本語（漢字・ひらがな・カタカナ）のみで記述してください。
                  
                  【出力形式】
                  {
                    "details": [
                      {
                        "word": "create",
                        "otherExamples": [
                          { "role": "動詞(作る)", "text": "She decided to create a new recipe for dinner.", "translation": "彼女は夕食のために新しいレシピを作ることに決めました。" },
                          { "role": "動詞(創造する)", "text": "The artist aims to create unique pieces of art.", "translation": "その芸術家はユニークな作品を創造することを目指しています。" }
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

              newWordsData = newWordsData.map((w: any) => {
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
        }
      }

      // 5. 新しく生成されたデータをキャッシュに保存
      for (const wordData of newWordsData) {
        // @ts-ignore
        await prisma.dictionaryEntry.upsert({
          where: { word: wordData.word.toLowerCase() },
          update: { data: wordData },
          create: {
            word: wordData.word.toLowerCase(),
            data: wordData
          }
        }).catch((e: any) => console.error("Failed to cache word:", wordData.word, e));
      }
    }

    // 6. 最終結果のマージ
    const finalResult = {
      words: [...foundWordsData, ...newWordsData]
    };

    const totalGeneratedCount = foundWordsData.length + newWordsData.length;

    // Deduct credits based on the TOTAL number of words (cached or new)
    if (totalGeneratedCount > 0) {
      // XP付与 (総単語数 x 10XP)
      await addXp(session.user.id, totalGeneratedCount * 10);

      // Proプランかつ有効ならクレジット消費なし
      if (!isUnlimited) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { credits: { decrement: totalGeneratedCount } }
        });
      }
    }

    return NextResponse.json(finalResult);

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
