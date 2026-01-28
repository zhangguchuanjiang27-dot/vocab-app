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
    },
    callbacks: {
        jwt: async ({ token, user }) => {
            if (user) {
                token.sub = user.id;
            }
            // 常にDBから最新のステータスを取得するようにするとヘッダーが大きくなる可能性があるが、
            // isPublicRankingだけなら微々たるもの。
            // ただし、パフォーマンスを考えて、ここではIDのみ保持し、
            // ページ側で必要に応じて再取得するのが安全か。
            return token;
        },
        session: async ({ session, token }) => {
            if (session?.user) {
                session.user.id = token.sub as string;
            }
            return session;
        },
    },
    debug: false,
    secret: process.env.NEXTAUTH_SECRET || "secret",
}
