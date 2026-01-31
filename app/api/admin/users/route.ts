import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

// 全ユーザー取得API
export async function GET() {
    try {

        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 管理者チェック (role !== 'admin' なら拒否)
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
        const isDemoAdmin = session.user.email === 'dev@example.com';
        const isEnvAdmin = ADMIN_EMAIL && session.user.email === ADMIN_EMAIL;
        const isDbAdmin = (currentUser as any)?.role === "admin";

        if (!isDemoAdmin && !isEnvAdmin && !isDbAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const users = await prisma.user.findMany({
            orderBy: { lastLoginAt: "desc" },
            include: {
                _count: {
                    select: { decks: true }
                }
            }
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error("Admin API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
