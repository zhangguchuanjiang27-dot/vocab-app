"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoading = status === "loading";
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handleSubscription = async (plan: 'basic' | 'pro') => {
    setSubscriptionLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "エラーが発生しました");
        setSubscriptionLoading(false);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error(error);
      alert("通信エラーが発生しました");
      setSubscriptionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-black">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 p-6 sm:p-12 font-sans relative overflow-hidden">
      {/* Background Gradients (Aurora Effect) */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-500/10 blur-[120px] rounded-full -z-10"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full -z-10"></div>

      <main className="max-w-4xl mx-auto relative z-10">
        <Link href="/" className="inline-block px-5 py-2 text-sm font-bold text-neutral-400 hover:text-white bg-neutral-900/50 border border-neutral-800 rounded-full transition-all mb-12">
          ← ホームに戻る
        </Link>
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-6xl font-black mb-4 text-white" style={{ fontFamily: 'var(--font-merriweather)' }}>
            プランの選択
          </h1>
          <p className="text-lg sm:text-xl text-neutral-400 max-w-2xl mx-auto">
            あなたの学習スタイルに合わせて、最適なプランをお選びください。
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 relative z-10 mb-20">
          {/* Basic Plan */}
          <div className="p-8 rounded-[2.5rem] bg-neutral-900/50 border border-neutral-800 shadow-2xl flex flex-col relative overflow-hidden group hover:border-emerald-500/30 transition-all">
            <div className="mb-8">
              <div className="text-xs font-black text-emerald-400 uppercase tracking-[0.2em] mb-3">Basic Plan</div>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-white">¥300</span>
                <span className="text-neutral-500"> / 月</span>
              </div>
            </div>

            <div className="flex-1 space-y-5 mb-10">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 text-xs font-bold border border-emerald-500/20">✓</div>
                <div>
                  <p className="font-bold text-white">毎月 500 クレジット</p>
                  <p className="text-xs text-neutral-500 mt-1">約500回分の単語生成が可能です。</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 text-xs font-bold border border-emerald-500/20">✓</div>
                <div>
                  <p className="font-bold text-white">広告なし</p>
                  <p className="text-xs text-neutral-500 mt-1">学習に集中できる環境を提供。</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 text-xs font-bold border border-emerald-500/20">✓</div>
                <div>
                  <p className="font-bold text-white">全ての基本機能へアクセス</p>
                  <p className="text-xs text-neutral-500 mt-1">全ての学習モードが利用可能です。</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleSubscription('basic')}
              disabled={subscriptionLoading}
              className="w-full py-4 bg-neutral-800 text-white rounded-2xl font-bold hover:bg-neutral-700 transition-all disabled:opacity-50 active:scale-95 border border-neutral-700"
            >
              {subscriptionLoading ? "処理中..." : "Basic Planを選択"}
            </button>
          </div>

          {/* Pro Plan */}
          <div className="p-8 rounded-[2.5rem] bg-indigo-500/5 border border-indigo-500/30 shadow-2xl flex flex-col relative overflow-hidden group hover:border-indigo-500 transition-all transform hover:scale-[1.02]">
            <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-black px-5 py-2 rounded-bl-2xl tracking-[0.2em] uppercase">RECOMMENDED</div>

            <div className="mb-8 relative z-10">
              <div className="text-xs font-black text-indigo-400 uppercase tracking-[0.2em] mb-3">Pro Plan</div>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black text-white">¥980</span>
                <span className="text-neutral-500"> / 月</span>
              </div>
            </div>

            <div className="flex-1 space-y-5 mb-10 relative z-10">
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 text-xs font-bold border border-indigo-500/20">✓</div>
                <div>
                  <p className="font-bold text-white">毎月 2,000 クレジット</p>
                  <p className="text-xs text-neutral-400 mt-1">約2,000回分の生成が可能。ヘビーユーザー向け。</p>
                </div>
              </div>
              <div className="flex items-start gap-4 text-indigo-300">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 text-xs font-bold border border-indigo-500/20">✓</div>
                <div>
                  <p className="font-bold">優先サポート & 速度向上</p>
                  <p className="text-xs opacity-70 mt-1">AI処理を最優先で実行し、お困りごとも迅速に対応。</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 text-xs font-bold border border-indigo-500/20">✓</div>
                <div>
                  <p className="font-bold text-white">新機能の先行アクセス</p>
                  <p className="text-xs text-neutral-400 mt-1">開発中の最新機能をどこよりも早く体験。</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleSubscription('pro')}
              disabled={subscriptionLoading}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/30 transition-all disabled:opacity-50 active:scale-95 relative z-10"
            >
              {subscriptionLoading ? "処理中..." : "Pro Planを選択"}
            </button>

            {/* Decoration */}
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] pointer-events-none"></div>
          </div>
        </div>

        <div className="border-t border-neutral-800 pt-16">
          <h2 className="font-black text-2xl mb-10 text-center text-white">よくある質問</h2>
          <div className="grid md:grid-cols-2 gap-10 text-sm">
            <div className="bg-neutral-900/30 p-6 rounded-2xl border border-neutral-800/50">
              <p className="font-bold text-white mb-3">解約はいつでもできますか？</p>
              <p className="text-neutral-400 leading-relaxed">はい、プロフィールページからいつでも解約可能です。解約後も、次回請求日までは機能をご利用いただけます。</p>
            </div>
            <div className="bg-neutral-900/30 p-6 rounded-2xl border border-neutral-800/50">
              <p className="font-bold text-white mb-3">プランの変更は可能ですか？</p>
              <p className="text-neutral-400 leading-relaxed">はい、いつでもアップグレード・ダウングレードが可能です。差額は自動的に日割り計算されます。</p>
            </div>
            <div className="bg-neutral-900/30 p-6 rounded-2xl border border-neutral-800/50">
              <p className="font-bold text-white mb-3">支払い方法は何がありますか？</p>
              <p className="text-neutral-400 leading-relaxed">主要なクレジットカード（Visa, Mastercard, Amex, JCB等）をご利用いただけます。</p>
            </div>
            <div className="bg-neutral-900/30 p-6 rounded-2xl border border-neutral-800/50">
              <p className="font-bold text-white mb-3">返金ポリシーはありますか？</p>
              <p className="text-neutral-400 leading-relaxed">デジタルコンテンツの性質上、原則として返金は承っておりません。ただし、万が一重大な不具合等があった場合はご連絡ください。</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
