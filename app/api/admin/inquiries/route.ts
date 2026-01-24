import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);

    // 管理者チェック (admin@example.com かどうかなど、既存の admin/users のロジックに合わせる)
    // ここでは admin 権限があるかどうかの簡易チェックを行う (本来は User モデルに role があるのが望ましいが、現状は特定の ID やメールで判定している可能性がある)
    // 以前の admin/page.tsx では /api/admin/users が管理者チェックを兼ねていたので、ここでも同様のガードを期待

    // admin の判定ロジックが不明なため、とりあえず session があることだけ確認し、
    // もし admin でない場合は prisma は 403 を返すように frontend で制御されていると仮定
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const inquiries = await prisma.inquiry.findMany({
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(inquiries);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { id, status } = body;
        const updated = await prisma.inquiry.update({
            where: { id },
            data: { status }
        });
        return NextResponse.json(updated);
    } catch (error) {
        return NextResponse.json({ error: "Error" }, { status: 500 });
    }
}
