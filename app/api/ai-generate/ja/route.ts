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
      あなたは日本語のエキスパートです。
      提供された「単語リスト」と「熟語リスト」に含まれる日本語の単語や熟語を抽出し、すべて「原形（辞書形）」に直してリスト化してください。
      
      【変換ルール】
      1. **動詞・形容詞の正規化**: 活用形（ます形、て形、た形など）はすべて「辞書形（終止形）」にする。
         例: 食べます -> 食べる, 行って -> 行く, 美しかった -> 美しい, 忙しくない -> 忙しい

      2. **名詞**: そのまま抽出する。

      3. **重複排除**: 完全に重複する単語・熟語は1つにまとめる。

      4. **クレンジング**: 明らかなゴミデータ（記号のみなど）は除外する。

      【出力形式】
      {
        "lemmas": ["refresher training", "apple", "play", "study", ...]
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
          あなたは日本語教育のエキスパートです。
          リストされた日本語の単語について、英語圏の学習者向けに以下の形式でJSONを生成してください。
          
          【出力形式】
          - word: 日本語の単語（漢字・かな）
          - partOfSpeech: 品詞（Noun/Verb/Adjective/Idiom, etc.）
          - meaning: 英語の意味。形式は「【Part】Definition 1, Definition 2...」としてください。
          
          【制約】
          - meaningには日本語を含めないこと。英語で説明すること。
          
          【出力例】
          {
            "words": [
              { "word": "首都", "partOfSpeech": "Noun", "meaning": "【Noun】capital, metropolis" }
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
                  以下の日本語の単語と英語の意味のリストをもとに、**それぞれの意味（英語）に対応する日本語の例文**を1つずつ作成してください。
        
                  【入力データ】
                  ${JSON.stringify(newWordsData, null, 2)}
        
                  【作成ルール】
                  1. **意味の完全分割**: "meaning" に複数の意味が含まれている場合、それぞれの意味ごとに例文を作成してください。
                  
                  2. **roleの形式**: 必ず **「Part(Meaning)」** としてください。（英語で）
                     例: "Noun(capital)", "Verb(to eat)"
                     
                  3. **品質**: 自然で実用的な日本語（20文字以上）。
                  
                  4. **対訳**: 例文の英訳（Natural English translation）を必ず含めること。
                  
                  【出力形式】
                  {
                    "details": [
                      {
                        "word": "首都",
                        "otherExamples": [
                          { "role": "Noun(capital)", "text": "東京は日本の首都であり、政治と経済の中心です。", "translation": "Tokyo is the capital of Japan and the center of politics and economy." }
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
