const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAgency() {
  try {
    const existing = await prisma.agency.findFirst({ where: { userId: 100 } });
    if (existing) {
      console.log('Agency already exists', existing);
      return;
    }
    const newAgency = await prisma.agency.create({
      data: {
        name: 'vipul',
        email: 'vipul@gmail.com',
        userId: 100,
        address1: 'Test Address',
        city: 'Mumbai',
        pincode: 400001,
        contactPersonName: 'Vipul',
        mobile: '0000000000'
      }
    });
    console.log("SUCCESSFULLY CREATED:", newAgency);
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
createAgency();
