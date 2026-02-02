import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { items } = await req.json(); // format: [{ id: "deckId", order: 0 }, { id: "deckId2", order: 1 }]

    if (!Array.isArray(items)) {
        return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }

    try {
        // Transaction to update all items efficiently
        await prisma.$transaction(
            items.map((item: any) =>
                prisma.deck.update({
                    where: { id: item.id, userId: session.user.id },
                    data: { order: item.order },
                })
            )
        );

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Reorder failed", err);
        return NextResponse.json({ error: "Failed to reorder decks" }, { status: 500 });
    }
}
