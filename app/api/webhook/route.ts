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
        event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err: any) {
        console.error(`Webhook signature verification failed.`, err.message);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;

        // metadataからユーザーIDと追加クレジット数を取得
        const userId = session.metadata?.userId;
        const creditsStr = session.metadata?.credits;

        if (userId && creditsStr) {
            const creditsToAdd = parseInt(creditsStr, 10);

            try {
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        credits: {
                            increment: creditsToAdd
                        }
                    }
                });
                console.log(`Added ${creditsToAdd} credits to user ${userId}`);
            } catch (error) {
                console.error('Error updating user credits:', error);
                // Webhookは200を返しておかないとリトライされてしまうが、DBエラーはログに残す
                return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
            }
        }
    }

    return NextResponse.json({ received: true });
}
