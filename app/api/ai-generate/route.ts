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

    // 1. 入力テキストを「単語リスト」に分割・正規化
    // 改行、カンマで分割し、さらに各行の先頭の番号や記号を除去する
    const rawLines = text.split(/[\n,]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);

    // 単語のみを抽出するための簡易クリーニング (例: "1. apple" -> "apple")
    // 小文字化してユニークにする
    const normalizedWordsMap = new Map<string, string>(); // normalized -> original
    rawLines.forEach((line: string) => {
      // 先頭の数字や記号（"1. ", "- "など）を削除、文末の空白削除
      const cleanWord = line.replace(/^[\d\-\.\s]+/, "").trim();
      if (cleanWord) {
        normalizedWordsMap.set(cleanWord.toLowerCase(), cleanWord);
      }
    });

    const uniqueWords = Array.from(normalizedWordsMap.keys());

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

      // クレジット足りてるか再確認 (足りない分だけで計算)
      if (userCredits < missingWords.length) {
        return NextResponse.json(
          { error: `Insufficient credits. You need ${missingWords.length} credits but have ${userCredits}.`, type: "credit_limit" },
          { status: 403 }
        );
      }

      const prompt = `
          あなたは英語学習のエキスパートです。
          リストされた英単語について、以下の形式でJSONを生成してください。
          
          【出力形式】
          - word: 英単語
          - partOfSpeech: 品詞（名詞/動詞/形容詞/熟語 など）
          - meaning: 日本語の意味。形式は「【品詞】意味1、意味2...」としてください。
            例: "capital" なら "【名】首都、資本、大文字 【形】主要な、重要な"
          
          【制約】
          - 最大 ${missingWords.length} 項目。
          - 返却は以下のJSON構造のみ：
          {
            "words": [
              { "word": "capital", "partOfSpeech": "名詞", "meaning": "【名】首都、資本、大文字 【形】主要な、重要な" }
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
                  1. **意味ごとの生成**: "meaning" 内の各意味（例：首都、資本、大文字）に対して、個別に例文を作成。
                  2. **roleの形式**: 必ず **「品詞(意味)」** としてください。
                     例: "名詞(資本)", "名詞(首都)", "形容詞(主要な)"
                  3. **品質**: 自然で実用的な英語（10-15語以上）。
                  
                  【出力形式】
                  {
                    "details": [
                      {
                        "word": "capital",
                        "otherExamples": [
                          { "role": "名詞(首都)", "text": "...", "translation": "..." },
                          { "role": "名詞(資本)", "text": "...", "translation": "..." }
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

      await prisma.user.update({
        where: { id: session.user.id },
        data: { credits: { decrement: totalGeneratedCount } }
      });
    }

    return NextResponse.json(finalResult);

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
