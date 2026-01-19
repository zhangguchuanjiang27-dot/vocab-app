import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { deleteDeck } from "@/app/lib/db";

export async function DELETE(
    req: Request,
    { params }: { params: { id: string } }
) {
    // @ts-ignore
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // @ts-ignore
    const success = await deleteDeck(id, session.user.id);

    if (!success) {
        return NextResponse.json({ error: "Deck not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}
