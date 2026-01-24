import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 簡易的な管理者チェック
    if (ADMIN_EMAIL && session.user.email !== ADMIN_EMAIL) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { userId, amount } = body;

        if (!userId || typeof amount !== 'number') {
            return NextResponse.json({ error: "Invalid data" }, { status: 400 });
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                credits: {
                    increment: amount
                }
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update credits" }, { status: 500 });
    }
}
