import type { Metadata } from "next";
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
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { credits: true }
    });
    credits = user?.credits ?? 0;
  }

  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} ${merriweather.variable} ${notoSerifJP.variable} bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 min-h-screen flex flex-col`}>
        <Providers>
          <nav className="border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
              <Link href="/" className="font-black text-xl tracking-tight flex items-center gap-2">
                <span className="text-2xl">⚡️</span>
                <span>Voca</span>
              </Link>

              <div className="flex items-center gap-6">
                {session ? (
                  <>
                    {/* ダッシュボード機能がまだ実装されていない場合はリンクを隠すか、Homeを兼ねる */}
                    {/* <Link href="/dashboard" className="text-sm font-bold text-neutral-500 hover:text-black dark:hover:text-white transition-colors">単語帳一覧</Link> */}

                    <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900 rounded-full border border-neutral-200 dark:border-neutral-800">
                      <span className="text-lg">🪙</span>
                      <span className="font-bold font-mono text-sm">{credits}</span>
                      <Link href="/checkout" className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold hover:bg-indigo-500 transition-colors ml-1">
                        追加
                      </Link>
                    </div>
                    <div className="flex items-center gap-3 pl-3 border-l border-neutral-200 dark:border-neutral-800">
                      {session.user?.image && (
                        <img src={session.user.image} alt="User" className="w-8 h-8 rounded-full border border-neutral-200 dark:border-neutral-800" />
                      )}
                      <Link href="/api/auth/signout" className="text-xs font-bold text-neutral-500 hover:text-black dark:hover:text-white">
                        ログアウト
                      </Link>
                    </div>
                  </>
                ) : (
                  <Link href="/api/auth/signin" className="text-sm font-bold bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-full hover:opacity-80 transition-opacity">
                    ログイン
                  </Link>
                )}
              </div>
            </div>
          </nav>

          <main className="flex-1">
            {children}
          </main>

          <footer className="py-8 text-center text-xs text-neutral-400 border-t border-neutral-100 dark:border-neutral-900 mt-12 bg-neutral-50 dark:bg-neutral-950">
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
    </html>
  );
}
