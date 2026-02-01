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
    <div className="min-h-screen bg-neutral-50 dark:bg-black text-neutral-900 dark:text-neutral-100 p-6 sm:p-12 font-sans">
      <main className="max-w-4xl mx-auto">
        <Link href="/" className="inline-block px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors mb-8">
          ← ホームに戻る
        </Link>
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 font-feature-settings-opentype">
            プランの選択
          </h1>
          <p className="text-xl text-neutral-500 dark:text-neutral-400">
            あなたの学習スタイルに合わせて、最適なプランをお選びください。
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 relative z-10 mb-12">
          {/* Basic Plan */}
          <div className="p-8 rounded-3xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-xl flex flex-col relative overflow-hidden group hover:border-emerald-400 dark:hover:border-emerald-800 transition-colors">
            <div className="mb-6">
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Basic Plan</div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black text-neutral-900 dark:text-white">¥300</span>
                <span className="text-neutral-500">/月</span>
              </div>
            </div>

            <div className="flex-1 space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                <div>
                  <p className="font-bold text-sm">毎月 500 クレジット</p>
                  <p className="text-xs text-neutral-500 mt-1">約500回分の単語生成が可能です。</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                <div>
                  <p className="font-bold text-sm">広告なし</p>
                  <p className="text-xs text-neutral-500 mt-1">学習に集中できる環境を提供。</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                <div>
                  <p className="font-bold text-sm">全ての基本機能へアクセス</p>
                  <p className="text-xs text-neutral-500 mt-1">全ての学習モードが利用可能です。</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleSubscription('basic')}
              disabled={subscriptionLoading}
              className="w-full py-4 bg-white dark:bg-neutral-800 border-2 border-emerald-500 text-emerald-600 dark:text-emerald-400 rounded-xl font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50 shadow-sm"
            >
              {subscriptionLoading ? "処理中..." : "Basic Planを選択"}
            </button>
          </div>

          {/* Pro Plan */}
          <div className="p-8 rounded-3xl bg-neutral-900 dark:bg-white text-white dark:text-black shadow-2xl shadow-indigo-500/20 flex flex-col relative overflow-hidden transform hover:scale-[1.02] transition-transform duration-300">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-bold px-4 py-1.5 rounded-bl-xl tracking-widest uppercase">一番人気</div>

            <div className="mb-6 relative z-10">
              <div className="text-sm font-bold text-indigo-300 dark:text-indigo-600 uppercase tracking-wider mb-2">Pro Plan</div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black">¥980</span>
                <span className="text-neutral-400 dark:text-neutral-600">/月</span>
              </div>
            </div>

            <div className="flex-1 space-y-4 mb-8 relative z-10">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 dark:bg-indigo-100 text-indigo-300 dark:text-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                <div>
                  <p className="font-bold text-sm">毎月 2,000 クレジット</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">約2,000回分の生成が可能。ヘビーユーザー向け。</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 dark:bg-indigo-100 text-indigo-300 dark:text-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                <div>
                  <p className="font-bold text-sm">優先サポート</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">お困りの際は最優先で対応します。</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 dark:bg-indigo-100 text-indigo-300 dark:text-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold">✓</div>
                <div>
                  <p className="font-bold text-sm">新機能の先行アクセス</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">最新のAI機能をいち早く体験。</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleSubscription('pro')}
              disabled={subscriptionLoading}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg hover:shadow-indigo-500/50 transition-all disabled:opacity-50 relative z-10"
            >
              {subscriptionLoading ? "処理中..." : "Pro Planを選択"}
            </button>

            {/* Decoration */}
            <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
          </div>
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-12">
          <h2 className="font-bold text-xl mb-6 text-center">よくある質問</h2>
          <div className="grid md:grid-cols-2 gap-8 text-sm">
            <div>
              <p className="font-bold mb-2">解約はいつでもできますか？</p>
              <p className="text-neutral-500 leading-relaxed">はい、プロフィールページからいつでも解約可能です。解約後も、次回請求日までは機能をご利用いただけます。</p>
            </div>
            <div>
              <p className="font-bold mb-2">プランの変更は可能ですか？</p>
              <p className="text-neutral-500 leading-relaxed">はい、いつでもアップグレード・ダウングレードが可能です。差額は自動的に日割り計算されます。</p>
            </div>
            <div>
              <p className="font-bold mb-2">支払い方法は何がありますか？</p>
              <p className="text-neutral-500 leading-relaxed">主要なクレジットカード（Visa, Mastercard, Amex, JCB等）をご利用いただけます。</p>
            </div>
            <div>
              <p className="font-bold mb-2">返金ポリシーはありますか？</p>
              <p className="text-neutral-500 leading-relaxed">デジタルコンテンツの性質上、原則として返金は承っておりません。ただし、サービスに重大な欠陥があった場合はお問い合わせください。</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
