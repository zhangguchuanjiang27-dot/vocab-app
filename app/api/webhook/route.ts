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

    // --- 請求書支払い成功（毎月の更新・初回含む） ---
    else if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;

        if (subscriptionId) {
            console.log(`Processing payment success for subscription: ${subscriptionId}`);

            let user = await prisma.user.findFirst({
                where: { stripeCustomerId: customerId } as any
            }) as any;

            if (!user && invoice.customer_email) {
                user = await prisma.user.findUnique({ where: { email: invoice.customer_email } });
            }

            if (user) {
                const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);

                let planName = subscription.metadata?.plan;
                if (!planName) {
                    const priceId = subscription.items.data[0]?.price.id;
                    if (priceId === process.env.STRIPE_PRICE_ID_BASIC) planName = 'basic';
                    else if (priceId === process.env.STRIPE_PRICE_ID_PRO) planName = 'pro';
                    else planName = user.subscriptionPlan;
                }

                const updateData: any = {
                    subscriptionStatus: subscription.status,
                    subscriptionPlan: planName,
                    credits: 500, // 支払い成功時にのみ500枚を付与・リセット
                };

                if (subscription.current_period_end) {
                    updateData.subscriptionPeriodEnd = new Date(subscription.current_period_end * 1000);
                }

                await prisma.user.update({
                    where: { id: user.id },
                    data: updateData
                });
                console.log(`Successfully reset credits to 500 for user ${user.id} due to payment success`);
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
