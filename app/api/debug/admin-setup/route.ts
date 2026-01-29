import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
    // 開発環境のみ許可
    if (process.env.NODE_ENV !== "development") {
        return NextResponse.json({ error: "Only available in development" }, { status: 403 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 現在のユーザーをAdminにし、Proプランに設定する
        const oneMonthLater = new Date();
        oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

        const user = await prisma.user.update({
            where: { id: session.user.id },
            data: {
                role: "admin",
                subscriptionPlan: "pro",
                subscriptionStatus: "active",
                credits: 9999,
                subscriptionPeriodEnd: oneMonthLater,
            } as any,
        });

        return NextResponse.json({
            success: true,
            message: "User promoted to Admin and set to Pro plan",
            user: {
                email: user.email,
                role: (user as any).role,
                plan: (user as any).subscriptionPlan,
                credits: user.credits
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
