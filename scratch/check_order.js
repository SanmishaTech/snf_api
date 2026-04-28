const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.sNFOrder.findFirst({
    where: { orderNo: '2627-00003' }
  });
  console.log('ORDER:', JSON.stringify(order, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
