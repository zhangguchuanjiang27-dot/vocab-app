import { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "@/app/lib/prisma"

export const authOptions: NextAuthOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID ?? "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
            // アカウント選択画面を強制的に表示し、セッションの不整合を防ぐ
            authorization: {
                params: {
                    prompt: "select_account",
                    access_type: "offline",
                    response_type: "code"
                }
            }
        }),
        ...(process.env.NODE_ENV === 'development' ? [{
            id: 'credentials',
            name: 'Mock Login',
            type: 'credentials',
            credentials: {},
            authorize: async () => {
                const user = await prisma.user.upsert({
                    where: { email: 'dev@example.com' },
                    update: {},
                    create: {
                        email: 'dev@example.com',
                        name: 'Developer',
                        credits: 1000,
                    }
                });
                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                };
            }
        }] : []) as any,
    ],
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        jwt: async ({ token, user }) => {
            if (user) {
                token.sub = user.id;
            }
            return token;
        },
        session: async ({ session, token }) => {
            if (session?.user) {
                session.user.id = token.sub as string;
            }
            return session;
        },
    },
    // エラー時に強制的にサインインページへ戻るようにする
    pages: {
        signIn: '/auth/signin',
        error: '/auth/error',
    },
    debug: false,
    secret: process.env.NEXTAUTH_SECRET || "secret",
}
