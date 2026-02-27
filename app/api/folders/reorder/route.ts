import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function PUT(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { items } = await req.json();

        // Transaction to update all folders in order
        const updates = items.map((item: { id: string, order: number }) => {
            return (prisma.folder as any).update({
                where: {
                    id: item.id,
                    userId: session.user.id // Ensure they only update their own folders
                },
                data: { order: item.order },
            });
        });

        await prisma.$transaction(updates);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Folder reorder error:", err);
        return NextResponse.json({ error: "Failed to reorder folders" }, { status: 500 });
    }
}
