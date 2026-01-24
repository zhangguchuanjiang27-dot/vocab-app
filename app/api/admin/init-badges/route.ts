import { NextResponse } from "next/server";
import { initBadges } from "@/lib/gamification";

export async function GET() {
    try {
        await initBadges();
        return NextResponse.json({ success: true, message: "Badges initialized" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
