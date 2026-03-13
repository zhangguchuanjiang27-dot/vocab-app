import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (id === 'daily-10') {
        try {
            const user = (await prisma.user.update({
                where: { id: session.user.id },
                data: {
                    dailyStudyCount: { increment: 1 },
                    dailyLastStudiedAt: new Date()
                } as any
            })) as any;
            return NextResponse.json({
                success: true,
                study_count: user['dailyStudyCount'],
                last_studied_at: user['dailyLastStudiedAt']
            });
        } catch (err) {
            console.error(err);
            return NextResponse.json({ error: "Failed to record daily study session" }, { status: 500 });
        }
    }

    try {
        const deck = await prisma.deck.update({
            where: {
                id: id,
                userId: session.user.id
            },
            data: {
                study_count: {
                    increment: 1
                },
                last_studied_at: new Date()
            }
        });

        return NextResponse.json({ success: true, study_count: deck.study_count, last_studied_at: deck.last_studied_at });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to record study session" }, { status: 500 });
    }
}
