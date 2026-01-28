import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { name } = await req.json();

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    try {
        // @ts-ignore
        const result = await prisma.folder.updateMany({
            where: { id: id, userId: session.user.id },
            data: { name }
        });

        if (result.count === 0) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    try {
        // @ts-ignore
        const result = await prisma.folder.deleteMany({
            where: { id: id, userId: session.user.id }
        });

        if (result.count === 0) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }
}
