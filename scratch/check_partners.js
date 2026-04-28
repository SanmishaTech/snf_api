const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const partners = await prisma.deliveryPartner.findMany({
    include: {
      depot: true,
      user: true,
    }
  });
  console.log('DELIVERY PARTNERS:');
  console.log(JSON.stringify(partners, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
