const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    // Check delivery schedule entries with full relationship data
    const deliveryEntries = await prisma.deliveryScheduleEntry.findMany({
      take: 5,
      select: {
        id: true,
        depotProductVariantId: true,
        productId: true,
        quantity: true,
        status: true,
        DepotProductVariant: {
          select: {
            id: true,
            name: true,
            depotId: true,
            productId: true,
            mrp: true,
            price1Month: true,
            depot: {
              select: {
                id: true,
                name: true
              }
            },
            product: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        product: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    console.log('Delivery Schedule Entries with Relations:');
    console.log(JSON.stringify(deliveryEntries, null, 2));
    
    // Check DepotProductVariant records with full data
    const depotVariants = await prisma.depotProductVariant.findMany({
      select: {
        id: true,
        depotId: true,
        productId: true,
        name: true,
        mrp: true,
        price1Month: true,
        depot: {
          select: {
            id: true,
            name: true
          }
        },
        product: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    
    console.log('\nDepotProductVariant Records with Relations:');
    console.log(JSON.stringify(depotVariants, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();