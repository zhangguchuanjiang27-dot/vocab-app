import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

// ユーザー情報更新API (管理者がプランなどを手動変更)
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // 管理者チェック
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

        const body = await req.json();
        const { subscriptionPlan, credits, role } = body;

        const updateData: any = {
            subscriptionPlan,
            role,
            subscriptionStatus: subscriptionPlan ? "active" : null,
            subscriptionPeriodEnd: subscriptionPlan ? undefined : null, // FREE(null)なら期限を消去
        };

        // creditsが明示的に指定されている場合はそれを使用、
        // そうでない場合で且つプランがbasic/proに変更されたなら500にセット
        if (credits !== undefined) {
            updateData.credits = credits;
        } else if (subscriptionPlan === 'basic') {
            updateData.credits = 500;
        } else if (subscriptionPlan === 'pro') {
            updateData.credits = 2000;
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Admin Update Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        // 管理者チェック
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

        await prisma.user.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Admin Delete Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
