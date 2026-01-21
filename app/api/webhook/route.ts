import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/app/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-12-15.clover",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
    const body = await req.text();
    const headersList = await headers();
    const sig = headersList.get("stripe-signature") as string;

    let event: Stripe.Event;

    try {
        if (!endpointSecret) throw new Error("Stripe webhook secret is missing");

        console.log("Webhook signature:", sig);
        console.log("Webhook body length:", body.length);

        event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err: any) {
        console.error(`Webhook signature verification failed. Error: ${err.message}`);
        // キーの一部だけログに出して確認（セキュリティのため全表示は避ける）
        const secretHint = endpointSecret ? `...${endpointSecret.slice(-4)}` : "missing";
        console.error(`Secret hint: ${secretHint}, Sig hint: ${sig ? "present" : "missing"}`);

        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        // metadataからユーザーIDと追加クレジット数を取得
        const userId = session.metadata?.userId;
        const creditsStr = session.metadata?.credits;

        if (userId && creditsStr) {
            const creditsToAdd = parseInt(creditsStr, 10);
            console.log(`Processing webhook for UserID: ${userId}, Credits: ${creditsToAdd}`);

            try {
                const updatedUser = await prisma.user.update({
                    where: { id: userId },
                    data: {
                        credits: {
                            increment: creditsToAdd
                        }
                    }
                });
                console.log(`Successfully added credits. New balance: ${updatedUser.credits}`);
            } catch (error) {
                console.error('Database update failed:', error);
                // ユーザーIDが存在しない場合などのエラー詳細を出力
                return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
            }
        } else {
            console.error("Missing metadata in webhook session", { userId, creditsStr });
        }
    }

    return NextResponse.json({ received: true });
}
