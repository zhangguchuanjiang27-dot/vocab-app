const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst();
    if (user) {
        await prisma.user.update({
            where: { id: user.id },
            data: { role: 'admin' },
        });
        console.log(`User ${user.email} is now an ADMIN.`);
    } else {
        console.log("No users found.");
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
