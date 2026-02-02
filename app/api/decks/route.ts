import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { checkBadges } from "@/lib/gamification";

// POSTで受け取るデータの型を定義
interface WordInput {
  word: string;
  meaning: string;
  partOfSpeech?: string; // 追加
  example?: string;
  example_jp?: string;
  otherExamples?: any[];
  synonyms?: string[];
  antonyms?: string[];
}

export async function GET() {
  const session = await getServerSession(authOptions);

  // session.user.id が存在するかチェック
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decks = await prisma.deck.findMany({
      where: { userId: userId }, // 取得したIDを使用
      include: { words: true },
      orderBy: [
        // @ts-ignore
        { order: 'asc' },
        { createdAt: 'desc' }
      ]
    });
    return NextResponse.json(decks);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch decks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, words } = body;

    // バリデーション
    if (!title || !Array.isArray(words)) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    const deck = await prisma.deck.create({
      data: {
        title,
        userId: userId,
        words: {
          create: words.map((w: WordInput) => {
            // 今回の仕様変更:
            // 生成時は単語と意味のみ。例文などはアンロック時に生成・取得する。
            // よって、example, example_jp は空文字で保存する。
            let exampleJp = w.example_jp || "";

            // 拡張データを構築
            const extData = {
              examples: w.otherExamples || []
            };

            // データ詳細があれば拡張タグを追加
            if (extData.examples.length > 0) {
              exampleJp += `|||EXT|||${JSON.stringify(extData)}`;
            }

            return {
              word: w.word,
              meaning: w.meaning,
              partOfSpeech: w.partOfSpeech,
              example: w.example || "",
              example_jp: exampleJp
            };
          })
        }
      },
      include: { words: true }
    });

    // バッジ獲得チェック（非同期で実行）
    if (userId) {
      checkBadges(userId).catch(console.error);
    }

    return NextResponse.json(deck);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({
      error: `Failed to create deck: ${err.message}`
    }, { status: 500 });
  }
}
