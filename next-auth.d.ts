import NextAuth, { DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth/jwt" {
    interface JWT {
        role?: string
    }
}

declare module "next-auth" {
    /**
     * Sessionユーザーに `id` プロパティを追加
     */
    interface Session {
        user: {
            id: string
            role?: string
        } & DefaultSession["user"]
    }
}