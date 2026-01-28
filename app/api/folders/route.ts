import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name } = await req.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        // @ts-ignore: Prisma Client not generated yet
        const folder = await prisma.folder.create({
            data: {
                name,
                userId: session.user.id
            }
        });

        return NextResponse.json(folder);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json([], { status: 200 });
    }

    try {
        // @ts-ignore: Prisma Client not generated yet
        const folders = await prisma.folder.findMany({
            where: { userId: session.user.id },
            include: { decks: true },
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(folders);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
    }
}
