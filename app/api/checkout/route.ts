import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    // apiVersion: "2025-12-15.clover",
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

        // DBからユーザー情報を取得して顧客IDを確認
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
        });

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // 型定義エラー回避のためのキャスト
        const dbUser = user as any;

        // 既に有効なサブスクリプションを持っている場合はポータルへ誘導
        const hasActiveSubscription = dbUser.stripeCustomerId && dbUser.subscriptionStatus === 'active';

        if (hasActiveSubscription) {
            console.log("Redirecting to billing portal for existing customer:", dbUser.stripeCustomerId);
            const portalSession = await stripe.billingPortal.sessions.create({
                customer: dbUser.stripeCustomerId,
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

        // 既存のCustomer IDがある場合は再利用（新規作成しない）
        if (dbUser.stripeCustomerId) {
            checkoutSessionParams.customer = dbUser.stripeCustomerId;
        } else {
            checkoutSessionParams.customer_email = session.user.email || undefined;
        }

        const checkoutSession = await stripe.checkout.sessions.create(checkoutSessionParams);

        return NextResponse.json({ url: checkoutSession.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
