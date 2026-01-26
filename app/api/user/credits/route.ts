import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            credits: true,
            xp: true,
            subscriptionPlan: true,
            // @ts-ignore
            badges: {
                include: { badge: true }
            }
        },
    });

    return NextResponse.json({
        credits: user?.credits ?? 0,
        xp: user?.xp ?? 0,
        subscriptionPlan: user?.subscriptionPlan,
        badges: user?.badges ?? []
    });
}
