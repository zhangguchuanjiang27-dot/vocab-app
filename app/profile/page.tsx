import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";
import ProfileView from "@/app/components/ProfileView";

export default async function ProfilePage() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        redirect("/");
    }

    const userId = session.user.id;

    // Fetch full user profile including badges
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            badges: {
                include: { badge: true },
                orderBy: { obtainedAt: 'desc' }
            },
            _count: {
                select: { decks: true }
            }
        }
    });

    if (!user) {
        redirect("/");
    }

    // Fetch all available badges to show locked ones
    const allBadges = await prisma.badge.findMany({
        orderBy: { createdAt: 'asc' }
    });

    return <ProfileView user={user} allBadges={allBadges} />;
}
