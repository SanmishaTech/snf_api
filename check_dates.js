const { PrismaClient } = require('@prisma/client');

async function checkDeliveryDates() {
  const prisma = new PrismaClient();
  
  try {
    // Get all unique delivery dates
    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      select: {
        id: true,
        deliveryDate: true,
        depotProductVariantId: true,
        subscription: {
          select: {
            agencyId: true
          }
        }
      },
      orderBy: {
        deliveryDate: 'asc'
      }
    });
    
    console.log('Available delivery dates and DepotProductVariant status:');
    deliveries.forEach(d => {
      console.log(`ID: ${d.id}, Date: ${d.deliveryDate.toISOString().split('T')[0]}, DepotVariantId: ${d.depotProductVariantId}, AgencyId: ${d.subscription.agencyId}`);
    });
    
    // Group by date
    const dateGroups = {};
    deliveries.forEach(d => {
      const dateKey = d.deliveryDate.toISOString().split('T')[0];
      if (!dateGroups[dateKey]) {
        dateGroups[dateKey] = [];
      }
      dateGroups[dateKey].push(d);
    });
    
    console.log('\nGrouped by date:');
    Object.entries(dateGroups).forEach(([date, entries]) => {
      console.log(`${date}: ${entries.length} deliveries, Agency IDs: [${[...new Set(entries.map(e => e.subscription.agencyId))].join(', ')}]`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDeliveryDates();