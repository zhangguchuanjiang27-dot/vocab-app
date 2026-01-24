import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        const body = await req.json();
        const { email, type, message } = body;

        if (!email || !message) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const inquiry = await prisma.inquiry.create({
            data: {
                email,
                type: type || "other",
                message,
                userId: session?.user?.id || null,
            },
        });

        return NextResponse.json({ success: true, id: inquiry.id });
    } catch (error) {
        console.error("Inquiry error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
