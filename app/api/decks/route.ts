import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

interface WordInput {
  word: string;
  meaning: string;
  example?: string;
  example_jp?: string;
}

export async function GET(req: Request) {
    // @ts-ignore
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const decks = await prisma.deck.findMany({
            // @ts-ignore
            where: { userId: session.user.id },
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
    // @ts-ignore
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { title, words } = await req.json();

        const deck = await prisma.deck.create({
            data: {
                title,
                // @ts-ignore
                userId: session.user.id,
                words: {
                    create: words.map((w: any) => ({
                        word: w.word,
                        meaning: w.meaning,
                        example: w.example,
                        example_jp: w.example_jp
                    }))
                }
            },
            include: { words: true }
        });

        return NextResponse.json(deck);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to create deck" }, { status: 500 });
    }
}
