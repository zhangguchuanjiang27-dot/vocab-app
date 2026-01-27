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
        // 開発用モックログインプロバイダー
        ...(process.env.NODE_ENV === 'development' ? [{
            id: 'credentials',
            name: 'Mock Login (Dev Only)',
            type: 'credentials',
            credentials: {},
            authorize: async () => {
                // 開発用のダミーユーザーを返す
                const user = await prisma.user.upsert({
                    where: { email: 'dev@example.com' },
                    update: {},
                    create: {
                        email: 'dev@example.com',
                        name: 'Developer User',
                        image: 'https://ui-avatars.com/api/?name=Dev+User',
                        credits: 1000,
                    }
                });
                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image
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
                token.id = user.id;
            }
            return token;
        },
        session: async ({ session, token }) => {
            if (session?.user) {
                session.user.id = token.id as string;
            }
            return session;
        },
    },
    debug: true,
}
