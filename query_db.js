const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Check delivery schedule entries
    const deliveryEntries = await prisma.deliveryScheduleEntry.findMany({
      take: 10,
      select: {
        id: true,
        depotProductVariantId: true,
        productId: true,
        quantity: true,
        status: true
      }
    });
    
    console.log('Delivery Schedule Entries:');
    console.log(JSON.stringify(deliveryEntries, null, 2));
    
    // Check count of entries with depotProductVariantId populated
    const withDepotVariant = await prisma.deliveryScheduleEntry.count({
      where: {
        depotProductVariantId: {
          not: null
        }
      }
    });
    
    const totalEntries = await prisma.deliveryScheduleEntry.count();
    
    console.log(`\nTotal entries: ${totalEntries}`);
    console.log(`Entries with depotProductVariantId: ${withDepotVariant}`);
    console.log(`Entries without depotProductVariantId: ${totalEntries - withDepotVariant}`);
    
    // Check DepotProductVariant records
    const depotVariants = await prisma.depotProductVariant.findMany({
      take: 5,
      select: {
        id: true,
        depotId: true,
        productId: true,
        name: true
      }
    });
    
    console.log('\nDepotProductVariant Records:');
    console.log(JSON.stringify(depotVariants, null, 2));
    
    const totalDepotVariants = await prisma.depotProductVariant.count();
    console.log(`\nTotal DepotProductVariant records: ${totalDepotVariants}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();