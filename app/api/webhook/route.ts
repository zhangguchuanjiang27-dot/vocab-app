import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/app/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    // apiVersion: "2025-12-15.clover", // STARTUP ERROR FIX: Use default SDK version
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

        // サブスクリプション購入
        if (checkoutSession.mode === "subscription") {
            const subscriptionId = checkoutSession.subscription as string;
            const customerId = checkoutSession.customer as string;
            // メタデータからプランを取るが、なければinvoiceから推測が必要（後述のinvoiceイベントでカバーされるためここでは最低限）
            const plan = checkoutSession.metadata?.plan;

            if (userId && subscriptionId) {
                console.log(`Processing subscription checkout for UserID: ${userId}, Plan: ${plan}`);

                const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);
                console.log(`Retrieved subscription status: ${subscription.status}`);

                const updateData: any = {
                    stripeCustomerId: customerId,
                    subscriptionId: subscriptionId,
                    subscriptionStatus: subscription.status,
                };

                // 日付の安全な変換
                if (subscription.current_period_end) {
                    const periodEnd = new Date(subscription.current_period_end * 1000);
                    if (!isNaN(periodEnd.getTime())) {
                        updateData.subscriptionPeriodEnd = periodEnd;
                    }
                }

                if (plan) {
                    updateData.subscriptionPlan = plan;
                    // 初回のみここで付与（更新時はinvoiceイベントで）
                    if (plan === 'basic' || plan === 'pro') {
                        updateData.credits = 500;
                    }
                }

                try {
                    await prisma.user.update({
                        where: { id: userId },
                        data: updateData
                    });
                    console.log(`Successfully activated subscription for user ${userId}`);
                } catch (error) {
                    console.error('Database update failed for subscription:', error);
                }
            }
        }
        // 都度課金
        else if (checkoutSession.metadata?.type === "credit_purchase") {
            const creditsStr = checkoutSession.metadata?.credits;
            if (userId && creditsStr) {
                const creditsToAdd = parseInt(creditsStr, 10);
                if (!isNaN(creditsToAdd) && creditsToAdd > 0) {
                    await prisma.user.update({
                        where: { id: userId },
                        data: { credits: { increment: creditsToAdd } }
                    });
                }
            }
        }
    }

    // --- 請求書支払い成功 または サブスクリプション更新（アップグレード・ダウングレード） ---
    else if (event.type === "invoice.payment_succeeded" || event.type === "customer.subscription.updated") {
        const object = event.data.object as any;
        const subscriptionId = (object.subscription as string) || (object.id as string);
        const customerId = object.customer as string;

        if (subscriptionId) {
            console.log(`Processing ${event.type} for subscription: ${subscriptionId}`);

            let user = await prisma.user.findFirst({
                where: { stripeCustomerId: customerId } as any
            }) as any;

            if (!user && object.customer_email) {
                user = await prisma.user.findUnique({
                    where: { email: object.customer_email }
                });
            }

            if (user) {
                const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);

                let planName = subscription.metadata?.plan;
                if (!planName) {
                    const priceId = subscription.items.data[0]?.price.id;
                    if (priceId === process.env.STRIPE_PRICE_ID_BASIC) {
                        planName = 'basic';
                    } else if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
                        planName = 'pro';
                    } else {
                        planName = user.subscriptionPlan;
                    }
                }

                const updateData: any = {
                    subscriptionStatus: subscription.status,
                };

                if (subscription.current_period_end) {
                    const periodEnd = new Date(subscription.current_period_end * 1000);
                    if (!isNaN(periodEnd.getTime())) {
                        updateData.subscriptionPeriodEnd = periodEnd;
                    }
                }

                if (planName) {
                    updateData.subscriptionPlan = planName;
                    // プラン変更時や更新時、そのプランに応じたクレジットをセット（ProはUnlimitedなので実質無視されますが整合性のためにセット）
                    if (planName === 'basic' || planName === 'pro') {
                        updateData.credits = 500;
                    }
                }

                await prisma.user.update({
                    where: { id: user.id },
                    data: updateData
                });
                console.log(`Successfully sync subscription for user ${user.id} (Plan: ${planName})`);
            }
        }
    }

    return NextResponse.json({ received: true });
}
