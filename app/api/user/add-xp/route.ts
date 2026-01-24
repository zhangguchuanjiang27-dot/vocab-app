import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { addXp } from "@/lib/gamification";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { amount } = await req.json();

        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
        }

        // Add minimal server-side validation/throttling could be added here if needed
        // For now, trust the client logic but in production we'd want to verify expected amounts

        await addXp(session.user.id, amount);

        return NextResponse.json({ success: true, added: amount });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Server Error" }, { status: 500 });
    }
}
