import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/app/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20" as any, // Force stable version
    typescript: true,
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
    console.log("🔔 Webhook received at /api/webhook");
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

    // --- 初回checkout完了 ---
    if (event.type === "checkout.session.completed") {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const userId = checkoutSession.metadata?.userId;
        const plan = checkoutSession.metadata?.plan;

        console.log(`✅ checkout.session.completed: UserID=${userId}, Plan=${plan}, Mode=${checkoutSession.mode}`);

        // サブスクリプション購入
        if (checkoutSession.mode === "subscription") {
            const subscriptionId = checkoutSession.subscription as string;
            const customerId = checkoutSession.customer as string;

            if (userId && subscriptionId) {
                console.log(`🔍 Processing subscription: ${subscriptionId} for user ${userId}`);

                const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);
                const updateData: any = {
                    stripeCustomerId: customerId,
                    subscriptionId: subscriptionId,
                    subscriptionStatus: subscription.status,
                };

                if (subscription.current_period_end) {
                    updateData.subscriptionPeriodEnd = new Date(subscription.current_period_end * 1000);
                }

                if (plan) {
                    updateData.subscriptionPlan = plan;
                    if (plan === 'basic') updateData.credits = 500;
                    else if (plan === 'pro') updateData.credits = 2000;
                    console.log(`💰 Setting initial credits for plan ${plan}: ${updateData.credits}`);
                }

                try {
                    await prisma.user.update({
                        where: { id: userId },
                        data: updateData
                    });
                    console.log(`✨ DONE: User ${userId} is now ${plan}`);
                } catch (error) {
                    console.error('❌ DB Update Error (checkout):', error);
                }
            } else {
                console.warn("⚠️ Missing userId or subscriptionId in checkoutSession metadata");
            }
        }
    }

    // --- 請求書支払い成功 ---
    else if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;

        console.log(`✅ invoice.payment_succeeded: Customer=${customerId}, Sub=${subscriptionId}`);

        if (subscriptionId) {
            let user = await prisma.user.findFirst({
                where: { stripeCustomerId: customerId } as any
            }) as any;

            if (!user && invoice.customer_email) {
                user = await prisma.user.findUnique({ where: { email: invoice.customer_email } });
                console.log(`🔍 Found user by email: ${invoice.customer_email}`);
            }

            if (user) {
                console.log(`👤 Found matching user: ${user.id} (${user.email})`);
                const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);

                let planName = subscription.metadata?.plan;
                if (!planName) {
                    const priceId = subscription.items.data[0]?.price.id;
                    console.log(`🔍 No plan in metadata, checking PriceID: ${priceId}`);
                    if (priceId === process.env.STRIPE_PRICE_ID_BASIC) planName = 'basic';
                    else if (priceId === process.env.STRIPE_PRICE_ID_PRO) planName = 'pro';
                }

                console.log(`📊 Determined Plan: ${planName}`);

                const updateData: any = {
                    subscriptionStatus: subscription.status,
                    subscriptionPlan: planName,
                };

                if (planName === 'basic') updateData.credits = 500;
                else if (planName === 'pro') updateData.credits = 2000;

                if (subscription.current_period_end) {
                    updateData.subscriptionPeriodEnd = new Date(subscription.current_period_end * 1000);
                }

                try {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: updateData
                    });
                    console.log(`✨ DONE: User ${user.id} updated via invoice success`);
                } catch (error) {
                    console.error('❌ DB Update Error (invoice):', error);
                }
            } else {
                console.warn("⚠️ No user found for this invoice/customer");
            }
        }
    }
    // --- サブスクリプション更新（解約予約・アップグレードなど） ---
    // ここではコインはいじらず、状態（ステータスや期限）だけを同期する
    else if (event.type === "customer.subscription.updated") {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;

        console.log(`Processing subscription update: ${subscription.id} (Status: ${subscription.status})`);

        const updateData: any = {
            subscriptionStatus: subscription.status,
        };

        if (subscription.current_period_end) {
            updateData.subscriptionPeriodEnd = new Date(subscription.current_period_end * 1000);
        }

        // ポータルからプラン変更した直後の同期
        const priceId = subscription.items.data[0]?.price.id;
        if (priceId === process.env.STRIPE_PRICE_ID_BASIC) updateData.subscriptionPlan = 'basic';
        else if (priceId === process.env.STRIPE_PRICE_ID_PRO) updateData.subscriptionPlan = 'pro';

        await prisma.user.updateMany({
            where: { stripeCustomerId: customerId } as any,
            data: updateData
        });
    }
    // --- 契約期間終了（完全な解約） ---
    else if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as any;
        const customerId = subscription.customer as string;

        console.log(`Processing subscription expiration/deletion: ${subscription.id}`);

        await prisma.user.updateMany({
            where: { stripeCustomerId: customerId } as any,
            data: {
                subscriptionPlan: null,
                subscriptionStatus: 'canceled',
                credits: 0 // 期間が完全に終了したのでコインを0にする
            } as any
        });
    }

    return NextResponse.json({ received: true });
}
