import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

// POSTで受け取るデータの型を定義
interface WordInput {
  word: string;
  meaning: string;
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
      orderBy: { createdAt: 'desc' }
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
            let exampleJp = w.example_jp || "";
            // 追加例文と類義語・対義語を埋め込む
            const extras: any = {};
            if (w.otherExamples && Array.isArray(w.otherExamples) && w.otherExamples.length > 0) {
              extras.examples = w.otherExamples;
            }
            if (w.synonyms && Array.isArray(w.synonyms) && w.synonyms.length > 0) {
              extras.synonyms = w.synonyms;
            }
            if (w.antonyms && Array.isArray(w.antonyms) && w.antonyms.length > 0) {
              extras.antonyms = w.antonyms;
            }
            
            if (Object.keys(extras).length > 0) {
              exampleJp += `|||EXT|||${JSON.stringify(extras)}`;
            }

            return {
              word: w.word,
              meaning: w.meaning,
              example: w.example || "",
              example_jp: exampleJp
            };
          })
        }
      },
      include: { words: true }
    });

    return NextResponse.json(deck);
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      error: `Failed to create deck: ${err instanceof Error ? err.message : String(err)}`
    }, { status: 500 });
  }
}
