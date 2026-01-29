import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: "2024-06-20" as any, // Force stable version despite strange local types
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

        // DBからユーザー情報を取得
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const dbUser = user as any;
        let stripeCustomerId = dbUser.stripeCustomerId;

        // --- Important: Satisfy Accounts V2 requirement ---
        // If no customer exists, we MUST create one first.
        if (!stripeCustomerId) {
            console.log("Creating new Stripe customer for user:", session.user.email);
            const customer = await stripe.customers.create({
                email: session.user.email || undefined,
                name: session.user.name || undefined,
                metadata: {
                    userId: session.user.id,
                }
            });
            stripeCustomerId = customer.id;

            // Update user in DB with the new customer ID
            await prisma.user.update({
                where: { id: session.user.id },
                data: { stripeCustomerId: stripeCustomerId }
            });
        }

        // 既に有効なサブスクリプションを持っている場合はポータルへ誘導
        const hasActiveSubscription = dbUser.subscriptionStatus === 'active';

        if (hasActiveSubscription) {
            console.log("Redirecting to billing portal for existing customer:", stripeCustomerId);
            const portalSession = await stripe.billingPortal.sessions.create({
                customer: stripeCustomerId,
                return_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/`,
            });
            return NextResponse.json({ url: portalSession.url });
        }

        // --- 新規または再契約の場合 ---

        const checkoutSessionParams: Stripe.Checkout.SessionCreateParams = {
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
            customer: stripeCustomerId, // Always provide the customer ID
            success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/?success=true&plan=${plan}`,
            cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/?canceled=true`,
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
        };

        const checkoutSession = await stripe.checkout.sessions.create(checkoutSessionParams);

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
