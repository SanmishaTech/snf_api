const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const members = await prisma.member.findMany({
    where: {
      id: { in: [46, 55] }
    },
    include: {
      user: {
        select: {
          id: true,
          userUniqueId: true,
          name: true,
          createdAt: true
        }
      }
    }
  });
  console.log(JSON.stringify(members, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
