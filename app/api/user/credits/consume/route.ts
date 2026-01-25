import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { amount } = await req.json();
        const cost = parseInt(amount);

        if (isNaN(cost) || cost < 0) {
            return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { credits: true }
        });

        if (!user || user.credits < cost) {
            return NextResponse.json({ error: "Insufficient credits", currentCredits: user?.credits }, { status: 403 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: session.user.id },
            data: { credits: { decrement: cost } },
            select: { credits: true }
        });

        return NextResponse.json({ success: true, credits: updatedUser.credits });
    } catch (error) {
        console.error("Credit consume error:", error);
        return NextResponse.json({ error: "Failed to consume credits" }, { status: 500 });
    }
}
