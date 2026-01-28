import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name, image, isPublicRanking } = await req.json();

        const updatedUser = await (prisma.user as any).update({
            where: { id: session.user.id },
            data: {
                name: name !== undefined ? name : undefined,
                image: image !== undefined ? image : undefined,
                isPublicRanking: isPublicRanking !== undefined ? isPublicRanking : undefined,
            },
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error("Profile Update Error:", error);
        return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
}
