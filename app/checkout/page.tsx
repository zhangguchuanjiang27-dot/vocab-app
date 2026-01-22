"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoading = status === "loading";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handlePurchase = async () => {
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      if (!res.ok) throw new Error("Checkout failed");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error("Purchase error:", e);
      alert("決済ページへの移動に失敗しました");
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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 p-6 sm:p-12">
      <main className="max-w-2xl mx-auto">
        <Link href="/" className="inline-block px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors mb-8">
          ← ホームに戻る
        </Link>

        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 sm:p-12 shadow-sm border border-neutral-200 dark:border-neutral-800">
          <h1 className="text-4xl font-black mb-2">AI生成チケット</h1>
          <p className="text-neutral-500 mb-12">単語帳を無制限に生成できるチケットを購入します</p>

          <div className="space-y-6 mb-12">
            <div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <span className="text-3xl">🪙</span> 100回分チケット
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400 mb-4">AIが単語帳を生成する機能を100回利用できます。</p>
              
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                  <div>
                    <p className="font-bold">テキストから自動生成</p>
                    <p className="text-sm text-neutral-500">単語をテキストで入力するだけで、AIが意味・例文を自動作成</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                  <div>
                    <p className="font-bold">複数の例文</p>
                    <p className="text-sm text-neutral-500">各単語に複数の例文が付属。理解が深まります</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">✓</span>
                  <div>
                    <p className="font-bold">保存・共有</p>
                    <p className="text-sm text-neutral-500">作成した単語帳は保存でき、いつでも学習可能</p>
                  </div>
                </div>
              </div>

              <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mb-6">
                ¥300
              </div>

              <button
                onClick={handlePurchase}
                className="w-full px-8 py-4 bg-indigo-600 text-white rounded-full font-bold text-lg hover:bg-indigo-700 hover:shadow-xl hover:shadow-indigo-500/30 transition-all active:scale-95"
              >
                決済へ進む
              </button>

              <p className="text-xs text-neutral-500 text-center mt-4">
                クレジットカード情報は安全に処理されます（Stripe決済）
              </p>
            </div>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-8">
            <h2 className="font-bold text-lg mb-4">よくある質問</h2>
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-bold mb-1">チケットの有効期限は？</p>
                <p className="text-neutral-500">チケットに有効期限はありません。いつでも使用できます。</p>
              </div>
              <div>
                <p className="font-bold mb-1">キャンセルはできますか？</p>
                <p className="text-neutral-500">ご購入後のキャンセル・返金は承っておりません。</p>
              </div>
              <div>
                <p className="font-bold mb-1">複数購入できますか？</p>
                <p className="text-neutral-500">はい、何度でもご購入できます。</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
