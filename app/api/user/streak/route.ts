import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // DEBUG: Temporarily disabled for login debugging
    /*
    const userId = session.user.id;
    const now = new Date();
    // ... logic ...
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { loginStreak: true, lastLoginAt: true }
    });
    // ... remaining logic ...
    */

    return NextResponse.json({
        streak: 0,
        lastLoginDate: "",
        updated: false
    });
}
