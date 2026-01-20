import NextAuth, { DefaultSession } from "next-auth"

declare module "next-auth" {
    /**
     * Sessionユーザーに `id` プロパティを追加
     */
    interface Session {
        user: {
            id: string
        } & DefaultSession["user"]
    }
}