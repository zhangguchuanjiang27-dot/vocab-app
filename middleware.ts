import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function middleware(req) {
        // 管理者権限のチェック
        if (req.nextUrl.pathname.startsWith("/sys-ctrl-99")) {
            const token = req.nextauth.token;
            // ロールがadminでない場合はトップページへリダイレクト
            if (token?.role !== "admin") {
                return NextResponse.redirect(new URL("/", req.url));
            }
        }
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
    }
);

// 保護するルートの定義
export const config = {
    matcher: [
        "/sys-ctrl-99/:path*",
        "/profile/:path*",
        "/checkout/:path*",
        // apiルートの一部も保護可能ですが、ここではページ遷移を中心に保護
    ],
};
