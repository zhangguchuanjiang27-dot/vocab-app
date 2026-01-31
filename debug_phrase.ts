
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Manual .env loading
const loadEnv = (filename: string) => {
    const p = path.resolve(__dirname, filename);
    if (fs.existsSync(p)) {
        const conf = fs.readFileSync(p, 'utf-8');
        conf.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^"|"$/g, '');
                process.env[key] = value;
            }
        });
    }
};
loadEnv('.env');
loadEnv('.env.local');

const prisma = new PrismaClient();

async function main() {
    console.log("Starting debug script...");

    const rawInput = "from the date shown above";
    console.log(`Input: "${rawInput}"`);

    const rawLines = rawInput.split('\n')
        .map((line: string) => line.replace(/^[\d\-\.\s]+/, "").trim())
        .filter((line: string) => line.length > 0);

    // Step 0: Normalization
    const normalizationPrompt = `
      あなたは言語学のエキスパートです。
      提供された英単語・熟語のリストを、適切な「学習用の基本形」に変換してください。
      ただし、フレーズや文は**絶対に分解せず**、そのまま出力してください。
      
      【最優先ルール】
      1. **行の統合性を維持する (DO NOT SPLIT)**: 
         入力された1行が複数の単語で構成されている場合（例: "from the date shown above"や"connected with"）、
         それを**1つの塊**として扱ってください。
         ❌ 禁止: 文やフレーズから単語を抽出して分解すること（例: "from the date shown above" -> "date", "show", "above"）
         ✅ 正解: "from the date shown above" (1つの項目として出力)

      2. **熟語・フレーズの扱い**: 
         熟語や慣用句、例文などは、その意味が通じる自然な形を維持してください。
         文法的に不自然になるような無理な原形化は避けてください。
         例: "when it comes to" (そのままでOK)

      3. **単語の正規化**:
         明らかに単一の単語（例: "playing"）の場合は、辞書形（"play"）に直しても構いません。
         
      4. **1対1の対応**:
         入力リストの項目数と、出力リストの項目数は**必ず一致**させてください。
         入力がN行なら、出力もN個の配列要素です。

      【出力形式】
      以下のJSON形式のみで出力してください。
      {
        "items": ["normalized_term_1", "normalized_term_2", ...]
      }

      対象リスト:
      ${JSON.stringify(rawLines)}
    `;

    console.log("Calling OpenAI for normalization...");
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
                temperature: 0,
            }),
        });

        if (!normResponse.ok) console.error("Normalization API failed", normResponse.status, normResponse.statusText);

        const normData = await normResponse.json();
        console.log("Norm Raw Response:", JSON.stringify(normData, null, 2));

        const normParsed = JSON.parse(normData.choices[0].message.content || "{}");
        console.log("Norm Parsed:", normParsed);

        if (normParsed.items && Array.isArray(normParsed.items)) {
            uniqueWords = Array.from(new Set(normParsed.items.map((w: string) => w.toLowerCase())));
        } else {
            console.log("Fallback used (AI returned no items)");
            uniqueWords = Array.from(new Set(rawLines.map((l: string) => l.toLowerCase())));
        }
    } catch (e) {
        console.error("Normalization Error:", e);
        uniqueWords = rawLines.map(l => l.toLowerCase());
    }

    console.log("Unique Words:", uniqueWords);

    const normalizedWordsMap = new Map<string, string>();
    uniqueWords.forEach(w => normalizedWordsMap.set(w, w));

    // Force delete to ensure fresh state
    const deleted = await prisma.dictionaryEntry.deleteMany({
        where: { word: "from the date shown above" }
    });
    console.log("Deleted cached entries:", deleted.count);

    // Check Cache
    const cachedEntries = await prisma.dictionaryEntry.findMany({
        where: {
            word: { in: uniqueWords }
        }
    });

    const debugData = {
        uniqueWords,
        cachedEntries: cachedEntries.map(c => c.data),
        generated: null as any
    };

    console.log("Cached Entries Length:", cachedEntries.length);

    const foundWordsSet = new Set(cachedEntries.map((entry: any) => entry.word));
    const missingWords = uniqueWords.filter(w => !foundWordsSet.has(w));

    console.log("Missing Words:", missingWords);

    if (missingWords.length === 0) {
        console.log("All words found in cache. Done.");
        fs.writeFileSync('debug_result.json', JSON.stringify(debugData, null, 2), 'utf-8');
        return;
    }

    // Generate
    const missingWordsText = missingWords.map(w => normalizedWordsMap.get(w)).join("\n");
    console.log("Generating for text:", missingWordsText);

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
          - 入力リストの各行に対して、必ず1つのJSONオブジェクトを生成してください。
          - 入力がフレーズ（例: "from the date shown above"）の場合、wordフィールドにそのフレーズ全体を入れてください。
          - 合計 ${missingWords.length} 項目を出力してください。
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

    const data = await response.json();
    console.log("Gen Raw Response:", JSON.stringify(data, null, 2));

    const parsed = JSON.parse(data.choices[0].message.content || "{}");
    console.log("Gen Parsed:", parsed);
    debugData.generated = parsed;

    fs.writeFileSync('debug_result.json', JSON.stringify(debugData, null, 2), 'utf-8');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
