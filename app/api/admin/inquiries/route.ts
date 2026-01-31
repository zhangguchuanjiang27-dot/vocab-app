import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        const isDemoAdmin = session.user.email === 'dev@example.com';
        const isEnvAdmin = ADMIN_EMAIL && session.user.email === ADMIN_EMAIL;
        const isDbAdmin = (currentUser as any)?.role === "admin";

        if (!isDemoAdmin && !isEnvAdmin && !isDbAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const inquiries = await prisma.inquiry.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                user: {
                    select: {
                        name: true,
                        image: true,
                        email: true,
                    }
                }
            }
        });
        return NextResponse.json(inquiries);
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        const isDemoAdmin = session.user.email === 'dev@example.com';
        const isEnvAdmin = ADMIN_EMAIL && session.user.email === ADMIN_EMAIL;
        const isDbAdmin = (currentUser as any)?.role === "admin";

        if (!isDemoAdmin && !isEnvAdmin && !isDbAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

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
