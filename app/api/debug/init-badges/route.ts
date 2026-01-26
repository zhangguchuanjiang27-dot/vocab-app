import { NextResponse } from "next/server";
import { initBadges } from "@/lib/gamification";

export async function GET() {
    try {
        await initBadges();
        return NextResponse.json({ success: true, message: "Badges initialized" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
