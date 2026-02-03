import type { Metadata } from "next";
import { GoogleAnalytics } from '@next/third-parties/google';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { Merriweather, Noto_Serif_JP } from "next/font/google";

const merriweather = Merriweather({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-merriweather",
});

const notoSerifJP = Noto_Serif_JP({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
});

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import Link from "next/link";
import { Providers } from "./providers";
import Header from "./components/Header"; // Adjust import path

export const metadata: Metadata = {
  title: "Voca - AI Flashcards",
  description: "AIが一瞬で単語帳を作成。効率的な英語学習をサポートします。",
};

// ナビゲーション用のクライアントコンポーネントを別途作ったほうが綺麗ですが、
// layout内で完結させるために、まずはサーバーサイドでデータを取得します。

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  // ユーザーのクレジット情報を取得（ログイン時のみ）
  let credits = 0;
  let plan: string | null = null;
  let subscriptionPeriodEnd: Date | null = null;
  let role: string = 'user';
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        credits: true,
        subscriptionPlan: true,
        subscriptionPeriodEnd: true,
        role: true
      }
    }) as any;
    credits = user?.credits ?? 0;
    plan = user?.subscriptionPlan ?? null;
    subscriptionPeriodEnd = user?.subscriptionPeriodEnd;
    role = user?.role ?? 'user';
  }

  // クライアントサイドでのストリーク取得用のコンポーネントを差し込むか、
  // ヘッダー全体をClient Componentにするのが理想的。
  // ここではサーバーサイドで初期値を取らず、Headerコンポーネントをクライアントコンポーネントとして分離するリファクタリングをするのが本来だが、
  // 既存構造を維持しつつ、単純にクライアントコンポーネント (StreakCounter) を埋め込む形にする。
  // まだStreakCounterがないため、直接は書けない。
  // なので、Providersの中にクライアントロジックを持つヘッダー内パーツを作成して配置するのが良い。

  // しかし、今回は `app/layout.tsx` が Server Component であるため、
  // ヘッダー部分を Client Component `Header.tsx` に切り出すのがベストプラクティス。
  // 時間短縮のため、ヘッダー内の動的パーツ (クレジット、ユーザーアイコンなど) を含む部分を
  // `app/components/Header.tsx` に切り出して、そこでストリーク取得を行う。


  return (
    <html lang="ja" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${merriweather.variable} ${notoSerifJP.variable} bg-black text-neutral-100 min-h-screen flex flex-col`}>
        <Providers>
          {/* Server Component から呼び出す Client Component として Header を実装 */}
          {/* Client Componentを作成していないため、一旦 layout.tsx 内で完結しているこのナビゲーションバーを
                そのまま使うが、ストリークを表示するために、
                StreakDisplay という小さな Client Component を作ってここに埋め込むのが一番手軽。
            */}
          <nav className="border-b border-neutral-800 bg-black/80 backdrop-blur-md sticky top-0 z-50">
            {/* ... nav content ... */}
            {/* 実際の実装: 既存のlayoutのnavをcomponents/Header.tsxに移設するよう指示し、それをインポート配置する。*/}
            {/* しかしファイル数が増えるので、簡易的に StreakBadge コンポーネントを作って配置する。 */}
            {/* ここで直接インポートできないため、一旦ファイルを書き換えて別ファイル (Header.tsx) を作成し、layout.tsxからはそれを呼ぶ形にするのが最もクリーン。 */}
            <Header
              initialCredits={credits}
              session={session}
              plan={plan}
              subscriptionPeriodEnd={subscriptionPeriodEnd ? subscriptionPeriodEnd.toISOString() : null}
              role={role}
            />
          </nav>

          <main className="flex-1">
            {children}
          </main>

          <footer className="py-8 text-center text-xs text-neutral-400 border-t border-neutral-900 mt-12 bg-neutral-950">
            <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p>© 2026 Voca All rights reserved.</p>
              <div className="flex gap-4">
                <Link href="/terms" className="hover:text-neutral-600 dark:hover:text-neutral-300">利用規約</Link>
                <Link href="/privacy" className="hover:text-neutral-600 dark:hover:text-neutral-300">プライバシーポリシー</Link>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
      <GoogleAnalytics gaId="G-JDF6ZRF07L" />
    </html>
  );
}
