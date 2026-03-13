import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // 直近14日分くらい取得して、クライアント側で7日分選別する
        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        // @ts-ignore
        const activities = await prisma.dailyActivity.findMany({
            where: {
                userId: session.user.id,
                date: {
                    gte: twoWeeksAgo
                }
            },
            orderBy: {
                date: 'asc'
            }
        });

        return NextResponse.json(activities);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
