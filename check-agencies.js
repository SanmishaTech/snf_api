const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAgencies() {
  try {
    const allAgencies = await prisma.agency.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        userId: true
      }
    });
    console.log("ALL AGENCIES:");
    console.table(allAgencies);

    const user = await prisma.user.findUnique({
      where: { email: 'vipul@gmail.com' }
    });
    console.log("USER:", user);
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
checkAgencies();
