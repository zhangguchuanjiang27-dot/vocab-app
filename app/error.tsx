"use client";

import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // 開発者向けにエラーをログ出力
        console.error("アプリケーションエラー発生:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-3xl font-bold mb-4 text-red-500">システムエラーが発生しました</h2>
            <p className="text-neutral-400 mb-6 max-w-md">
                予期せぬエラーが発生しました。時間をおいて再試行してください。<br /><br />
                <span className="text-xs text-neutral-600 bg-neutral-900 p-2 rounded">
                    エラー詳細 (開発者用): {error.message || "Unknown error"} <br />
                    Digest: {error.digest || "none"}
                </span>
            </p>
            <button
                onClick={() => reset()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors mb-4"
            >
                再試行する
            </button>
            <button
                onClick={() => window.location.href = "/"}
                className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-colors"
            >
                トップページに戻る
            </button>
        </div>
    );
}
