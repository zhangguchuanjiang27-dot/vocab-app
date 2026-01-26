import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2025-12-15.clover",
});

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { plan } = body; // 'basic' or 'pro'

        if (!plan || !['basic', 'pro'].includes(plan)) {
            return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
        }

        const priceId = plan === 'basic'
            ? process.env.STRIPE_PRICE_ID_BASIC
            : process.env.STRIPE_PRICE_ID_PRO;

        if (!priceId) {
            console.error(`Price ID not found for plan: ${plan}`);
            return NextResponse.json({ error: "Price configuration missing" }, { status: 500 });
        }

        // 既存のサブスクリプションを確認（二重契約防止）などのロジックも将来的には必要だが、
        // まずはStripe Checkoutへ誘導

        const checkoutSession = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
            success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/profile?success=true&plan=${plan}`,
            cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/profile?canceled=true`,
            customer_email: session.user.email || undefined, // Emailをプレフィル
            metadata: {
                userId: session.user.id,
                type: "subscription_create",
                plan: plan,
            },
            subscription_data: {
                metadata: {
                    userId: session.user.id,
                    plan: plan
                }
            }
        });

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
