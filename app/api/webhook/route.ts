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

                const updateData: any = {
                    stripeCustomerId: customerId,
                    subscriptionId: subscriptionId,
                    subscriptionStatus: subscription.status,
                    subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000),
                };

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

    // --- 請求書支払い成功（サブスク更新・初回含む） ---
    // これが最も確実に届くイベント。ここで期間更新とコイン付与を行うのがベストプラクティス。
    else if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object as any;
        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;

        if (subscriptionId) {
            console.log(`Processing invoice payment for subscription: ${subscriptionId}`);

            // ユーザーをStripe Customer IDから特定する
            // ※注意: PrismaスキーマのUserモデルで stripeCustomerId に @unique が付いている必要がある
            // 現在は付いていないかもしれないので、userIdをメタデータから探すか、検索する必要がある。
            // しかしInvoiceにはmetadataが含まれないことが多い（Subscriptionから継承されない設定の場合）。
            // 確実なのは "stripeCustomerId" でユーザーを検索すること。

            // 1. Stripe Customer IDでユーザー検索 (スキーマにuniqueがないとfindUniqueできないのでfindFirst)
            const user = await prisma.user.findFirst({
                where: { stripeCustomerId: customerId } as any
            }) as any;

            if (user) {
                const subscription: any = await stripe.subscriptions.retrieve(subscriptionId);

                // プランの特定（Price IDから判別）
                // 環境変数のIDと比較
                const priceId = subscription.items.data[0]?.price.id;
                let planName = user.subscriptionPlan; // 既存のプランを維持（デフォルト）

                if (priceId === process.env.STRIPE_PRICE_ID_BASIC) {
                    planName = 'basic';
                } else if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
                    planName = 'pro';
                }

                const updateData: any = {
                    subscriptionStatus: subscription.status,
                    subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000),
                };

                if (planName) {
                    updateData.subscriptionPlan = planName;
                    // 更新ごとに500枚にリセット（または加算したい場合は increment: 500）
                    // 仕様: 「毎月500枚付与」＝「500枚になる」なのか「+500」なのか。
                    // 今回は「500枚セット」で実装（繰り越しなしの場合）。
                    if (planName === 'basic' || planName === 'pro') {
                        updateData.credits = 500;
                    }
                }

                await prisma.user.update({
                    where: { id: user.id },
                    data: updateData
                });
                console.log(`Successfully renewed subscription for user ${user.id}`);
            } else {
                console.error(`User not found for Stripe Customer ID: ${customerId}`);
            }
        }
    }

    return NextResponse.json({ received: true });
}
