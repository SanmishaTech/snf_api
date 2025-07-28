const { PrismaClient } = require('@prisma/client');

async function testApiResponse() {
  const prisma = new PrismaClient();
  
  try {
    // Simulate the API call that AgencyDeliveryView makes
    const testDate = new Date('2025-01-28');
    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where: {
        deliveryDate: testDate,
        subscription: {
          agencyId: 1, // Assuming agency ID 1 exists
        },
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
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    console.log('API Response Simulation:');
    console.log(JSON.stringify(deliveries, null, 2));
    
    // Check if any entries have DepotProductVariant data
    const hasDepotVariant = deliveries.some(d => d.DepotProductVariant);
    const nullDepotVariant = deliveries.filter(d => !d.DepotProductVariant);
    
    console.log(`\nAnalysis:`);
    console.log(`Total deliveries: ${deliveries.length}`);
    console.log(`Deliveries with DepotProductVariant: ${deliveries.length - nullDepotVariant.length}`);
    console.log(`Deliveries without DepotProductVariant: ${nullDepotVariant.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testApiResponse();