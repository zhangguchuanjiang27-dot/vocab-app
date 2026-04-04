import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const email = process.argv[2] || "dev@example.com"
    console.log(`Setting admin role for ${email}...`)
    
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            role: "admin",
            subscriptionPlan: "pro",
            subscriptionStatus: "active",
            credits: 9999,
            subscriptionPeriodEnd: oneMonthLater,
        },
        create: {
            email,
            name: email.startsWith("dev") ? "Developer" : "Admin User",
            role: "admin",
            subscriptionPlan: "pro",
            subscriptionStatus: "active",
            credits: 9999,
            subscriptionPeriodEnd: oneMonthLater,
        }
    })

    console.log("Success!")
    console.log({
        email: user.email,
        role: user.role,
        plan: (user as any).subscriptionPlan,
        credits: user.credits
    })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
