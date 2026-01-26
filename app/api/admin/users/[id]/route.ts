import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

// ユーザー情報更新API (管理者がプランなどを手動変更)
export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const session = await getServerSession(authOptions);
        const { id } = params;

        // 管理者チェック
        const currentUser = await prisma.user.findUnique({
            where: { id: session?.user?.id },
        });

        if (!currentUser || (currentUser as any).role !== "admin") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await req.json();
        const { subscriptionPlan, credits, role } = body;

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                subscriptionPlan,
                credits,
                role,
                subscriptionStatus: subscriptionPlan ? "active" : null,
            } as any,
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Admin Update Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
