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
          create: words.map((w: WordInput) => ({
            word: w.word,
            meaning: w.meaning,
            example: w.example || "",
            example_jp: w.example_jp || "",
            otherExamples: w.otherExamples || [] // 追加の例文
          }))
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
