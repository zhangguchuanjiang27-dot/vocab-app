import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-12-18.acacia" as any, // TypeScriptエラー回避 & 最新の実在バージョン
    typescript: true
});

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
        return NextResponse.json({ error: "Email required" });
    }

    // 1. DBのユーザー情報
    const dbUser = (await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, stripeCustomerId: true, subscriptionPlan: true } as any
    })) as any;

    // 2. Stripeの顧客情報
    const customers = await stripe.customers.list({ email, limit: 1 });
    const stripeCustomer = customers.data[0];

    // 3. Subscription情報
    let subscriptions: any[] = [];
    if (stripeCustomer) {
        const subs = await stripe.subscriptions.list({ customer: stripeCustomer.id });
        subscriptions = subs.data;
    }

    return NextResponse.json({
        dbUser,
        stripeCustomer: stripeCustomer ? { id: stripeCustomer.id, email: stripeCustomer.email } : null,
        subscriptions: subscriptions.map(s => ({
            id: s.id,
            status: s.status,
            plan: s.items.data[0].price.id,
            metadata: s.metadata
        })),
        diagnosis: !dbUser ? "User not found in DB" :
            !stripeCustomer ? "Customer not found in Stripe" :
                dbUser.stripeCustomerId !== stripeCustomer.id ? "MISMATCH: DB customerId !== Stripe customerId" :
                    "IDs match."
    });
}
