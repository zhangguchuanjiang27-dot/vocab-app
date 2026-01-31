import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date(); // Current server time (usually UTC or configured env)

    // タイムゾーンの調整: 日本時間 (JST) でストリークを判定したい場合
    // 簡易的にサーバーの現在時刻をそのまま使用するが、本来はユーザーごとのTZを考慮するか、
    // 固定でJSTなどの特定のタイムゾーンオフセットを加えて計算する。
    // ここではシンプルにUTCで日付が変わればOKとするパターン（日本時間とは9時間のズレがあるが、一貫していれば機能する）
    // もし厳密に日本時間で切り替えたいなら、UTC+9した日付で文字列比較するのが確実。

    // UTCからJSTへ変換して日付文字列を取得
    const jstOffset = 9 * 60; // minutes
    const jstNow = new Date(now.getTime() + jstOffset * 60 * 1000);
    const todayStr = jstNow.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Userデータの取得
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { loginStreak: true, lastLoginAt: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let { loginStreak, lastLoginAt } = user;
    let streakUpdated = false;

    // 前回のログイン日付 (JST)
    let lastLoginDateStr = "";
    if (lastLoginAt) {
        const lastLoginJst = new Date(lastLoginAt.getTime() + jstOffset * 60 * 1000);
        lastLoginDateStr = lastLoginJst.toISOString().split('T')[0];
    }

    // ストリーク計算ロジック
    if (todayStr === lastLoginDateStr) {
        // 今日すでにログインしている -> 更新なし
    } else {
        const yesterday = new Date(jstNow);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastLoginDateStr === yesterdayStr) {
            // 昨日ログインしている -> 継続 +1
            loginStreak += 1;
        } else {
            // それ以外（初回、または一昨日以前） -> リセットして 1
            loginStreak = 1;
        }
        streakUpdated = true;
    }

    // 更新が必要ならDB保存
    if (streakUpdated) {
        await prisma.user.update({
            where: { id: userId },
            data: {
                loginStreak: loginStreak,
                lastLoginAt: now // 保存は実際のタイムスタンプ(UTC)
            }
        });

        // バッジ獲得チェック（ストリーク更新時）
        try {
            // gamification.tsがサーバーサイド専用の場合、動的インポートや共通関数化が必要だが、
            // ここでは簡易的にcheckBadgesがstreakのチェックも含んでいる前提で呼び出すか、
            // またはここで直接ロジックを書く。
            // 既存のcheckBadgesはstreakを見ていないため、修正が必要。
            // ここではまずcheckBadgesを呼び出し、その中でstreak判定を追加する修正をlib/gamification.tsに行う。

            // 下記のようにgamificationの関数を呼ぶためにはimportが必要
            const { checkBadges } = await import("@/lib/gamification");
            await checkBadges(userId);
        } catch (e) {
            console.error("Badge check failed:", e);
        }
    }

    return NextResponse.json({
        streak: loginStreak,
        lastLoginDate: todayStr,
        updated: streakUpdated
    });
}
