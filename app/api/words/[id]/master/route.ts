import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function PUT(
    req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { isMastered } = await req.json();

    try {
        const updatedWord = await prisma.wordCard.update({
            where: { id: params.id },
            data: { isMastered }
        });

        return NextResponse.json(updatedWord);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update word" }, { status: 500 });
    }
}
