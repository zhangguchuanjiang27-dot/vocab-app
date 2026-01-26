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
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const userId = checkoutSession.metadata?.userId;

        // --- サブスクリプション購入の場合 ---
        if (checkoutSession.mode === "subscription") {
            const subscriptionId = checkoutSession.subscription as string;
            const customerId = checkoutSession.customer as string;
            const plan = checkoutSession.metadata?.plan;

            if (userId && subscriptionId && plan) {
                console.log(`Processing subscription for UserID: ${userId}, Plan: ${plan}`);

                // Stripeからサブスクリプション詳細を取得して期間終了情報を得る
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);

                try {
                    // ユーザー情報を更新（Basicプランなら500クレジット付与などもここで行うか、別途invoiceイベントで行う）
                    // 今回は初回登録時として、Basicなら500クレジットをセット（上書きor加算）する方針で。
                    // 毎月の更新は invoice.payment_succeeded でやるのが正しいが、まずは初回を通す。

                    const updateData: any = {
                        stripeCustomerId: customerId,
                        subscriptionId: subscriptionId,
                        subscriptionStatus: subscription.status,
                        subscriptionPlan: plan,
                        subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000),
                    };

                    // Basicプランの場合、初期クレジット付与（毎月500回）
                    if (plan === 'basic') {
                        updateData.credits = { increment: 500 };
                    }

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
        // --- 都度課金（クレジット購入）の場合 ---
        else if (checkoutSession.metadata?.type === "credit_purchase") {
            const creditsStr = checkoutSession.metadata?.credits;

            if (userId && creditsStr) {
                const creditsToAdd = parseInt(creditsStr, 10);

                if (isNaN(creditsToAdd) || creditsToAdd <= 0) {
                    console.error("Invalid credits value", { creditsStr, parsed: creditsToAdd });
                    return NextResponse.json({ received: true });
                }

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
                }
            }
        }
    }

    return NextResponse.json({ received: true });
}
