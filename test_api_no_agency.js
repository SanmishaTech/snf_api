const { PrismaClient } = require('@prisma/client');

async function testApiWithoutAgencyFilter() {
  const prisma = new PrismaClient();
  
  try {
    // Test with a specific date that has data
    const testDate = new Date('2025-08-01');
    
    // First, check what the raw data looks like without agency filter
    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where: {
        deliveryDate: testDate,
      },
      select: {
        id: true,
        deliveryDate: true,
        quantity: true,
        status: true,
        product: {
          select: {
            id: true,
            name: true,
            unit: true,
          },
        },
        member: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                name: true,
                mobile: true,
              },
            },
          },
        },
        deliveryAddress: true,
        DepotProductVariant: {
          select: {
            id: true,
            name: true,
            hsnCode: true,
          },
        },
        subscription: {
          select: {
            id: true,
            period: true,
            deliverySchedule: true,
            agencyId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log('Raw data without agency filter:');
    console.log(JSON.stringify(deliveries, null, 2));
    
    // Check DepotProductVariant data specifically
    console.log('\nDepotProductVariant analysis:');
    deliveries.forEach((d, index) => {
      console.log(`Entry ${index + 1}:`);
      console.log(`  ID: ${d.id}`);
      console.log(`  DepotProductVariant: ${d.DepotProductVariant ? d.DepotProductVariant.name : 'NULL'}`);
      console.log(`  Agency ID: ${d.subscription.agencyId}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testApiWithoutAgencyFilter();