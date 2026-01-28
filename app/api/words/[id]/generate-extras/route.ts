import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    // Parse body
    const body = await req.json().catch(() => ({}));
    const type = body.type || "all"; // "all" or "synonyms"
    const isForce = !!body.force;

    // User Check
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true }
    });
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Credit Check (Always required)
    if (user.credits < 1) {
        return NextResponse.json({ error: "Insufficient credits" }, { status: 403 });
    }

    try {
        // Fetch Word
        const word = await prisma.wordCard.findUnique({
            where: { id },
            include: { deck: true }
        });

        if (!word) throw new Error("Word not found");
        if (word.deck.userId !== userId) throw new Error("Unauthorized");

        const wordKey = word.word.toLowerCase();
        let synonyms = null;
        let derivatives = null;
        let isCached = false;

        // 1. Cache Check (Only for 'all' mode, unless force is true)
        if (type === 'all' && !isForce) {
            // @ts-ignore
            const cacheEntry = await prisma.dictionaryEntry.findUnique({
                where: { word: wordKey }
            });

            if (cacheEntry && cacheEntry.data) {
                const data = cacheEntry.data as any;

                // 意味が大幅に変わっている場合はキャッシュを無視する（ユーザーが手動で編集した場合など）
                const cachedMeaning = String(data.meaning || "");
                const currentMeaning = String(word.meaning || "");

                // キャッシュに類義語/派生語があり、かつ意味が（ある程度）変わっていない場合のみキャッシュ採用
                if ((Array.isArray(data.synonyms) || Array.isArray(data.derivatives)) &&
                    (currentMeaning === cachedMeaning || currentMeaning.includes(cachedMeaning) || cachedMeaning.includes(currentMeaning))) {
                    synonyms = data.synonyms || null;
                    derivatives = data.derivatives || null;
                    isCached = true;
                    console.log(`Cache hit for word: ${wordKey}`);
                }
            }
        }

        // 2. Generation Logic
        if (!isCached) {
            let prompt = "";
            if (type === "all") {
                prompt = `
                単語 "${word.word}" について、以下のすべての意味を考慮して、類義語と派生語をリストアップしてください。
                意味: ${word.meaning}

                1. **類義語 (Synonyms)**: 全てを網羅するように最大5つまで。
                2. **派生語 (Derivatives)**: 存在するものを全て。

                【品詞ラベルのルール】
                品詞は必ず以下の略称（1文字）で出力してください：
                - 動詞 → 動
                - 名詞 → 名
                - 形容詞 → 形
                - 副詞 → 副
                - 熟語・その他 → 他

                出力形式:
                {
                  "synonyms": [
                    { "word": "単語", "partOfSpeech": "略称", "meaning": "意味" }
                  ],
                  "derivatives": [
                    { "word": "単語", "partOfSpeech": "略称", "meaning": "意味" }
                  ]
                }
                `;
            } else if (type === "synonyms") {
                prompt = `
                単語 "${word.word}" (意味: ${word.meaning}) の **類義語** を5つ提案してください。
                複数の意味がある場合は、それぞれの意味に対してバランスよく提案してください。

                【品詞ラベルのルール】
                品詞は必ず以下の略称（1文字）で出力してください：
                - 動詞 → 動
                - 名詞 → 名
                - 形容詞 → 形
                - 副詞 → 副
                - 熟語・その他 → 他

                出力形式:
                {
                  "synonyms": [
                     { "word": "単語", "partOfSpeech": "略称", "meaning": "意味" }
                  ]
                }
                `;
            }

            const response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "You are a vocabulary assistant. Output JSON only." },
                        { role: "user", content: prompt },
                    ],
                    temperature: 0.7,
                    response_format: { type: "json_object" },
                }),
            });

            if (!response.ok) throw new Error("OpenAI API Error");

            const aiData = await response.json();
            const content = JSON.parse(aiData.choices[0].message.content || "{}");

            if (type === 'all') {
                synonyms = content.synonyms || undefined;
                derivatives = content.derivatives || undefined;
            } else {
                synonyms = content.synonyms || undefined;
            }

            // 3. Update Cache (Only for 'all')
            if (type === 'all') {
                try {
                    // @ts-ignore
                    const existingCache = await prisma.dictionaryEntry.findUnique({
                        where: { word: wordKey }
                    });
                    let cacheData = existingCache?.data as any || {};
                    cacheData.word = word.word;
                    cacheData.meaning = word.meaning;
                    cacheData.synonyms = synonyms;
                    cacheData.derivatives = derivatives;

                    // @ts-ignore
                    await prisma.dictionaryEntry.upsert({
                        where: { word: wordKey },
                        update: { data: cacheData },
                        create: { word: wordKey, data: cacheData }
                    });
                } catch (e) {
                    console.error("Cache update failed", e);
                }
            }
        }

        // 4. Deduct Credit
        await prisma.user.update({
            where: { id: userId },
            data: { credits: { decrement: 1 } }
        });

        // 5. Update WordCard
        const updateData: any = {};
        if (synonyms !== undefined && synonyms !== null) updateData.synonyms = synonyms;
        if (derivatives !== undefined && derivatives !== null) updateData.derivatives = derivatives;

        const updatedWord = await prisma.wordCard.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({
            success: true,
            word: updatedWord,
            credits: user.credits - 1,
            cached: isCached
        });

    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: "Failed to generate extras" }, { status: 500 });
    }
}
