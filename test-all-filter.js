const { PrismaClient } = require('@prisma/client');

async function testAllFilter() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Testing ALL filter to ensure it shows all records...\n');
    
    // Test the ALL filter (should show everything)
    const allOrders = await prisma.productOrder.findMany({
      include: {
        subscriptions: {
          select: {
            id: true,
            expiryDate: true,
            paymentStatus: true,
            product: { select: { name: true } }
          }
        },
        member: {
          include: {
            user: { select: { name: true } }
          }
        }
      },
      take: 10
    });
    
    console.log(`📊 ALL filter found ${allOrders.length} orders:\n`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let cancelledOrders = 0;
    let expiredOrders = 0;
    let activeOrders = 0;
    
    allOrders.forEach((order, index) => {
      const isCancelled = order.paymentStatus === 'CANCELLED';
      const hasExpiredSubs = order.subscriptions.some(sub => {
        if (sub.paymentStatus === 'CANCELLED') return false;
        const expiryDate = new Date(sub.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        return expiryDate < today;
      });
      const hasActiveSubs = order.subscriptions.some(sub => {
        if (sub.paymentStatus === 'CANCELLED') return false;
        const expiryDate = new Date(sub.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        return expiryDate >= today;
      });
      
      let status = 'UNKNOWN';
      if (isCancelled) {
        status = 'CANCELLED';
        cancelledOrders++;
      } else if (hasExpiredSubs && !hasActiveSubs) {
        status = 'EXPIRED';
        expiredOrders++;
      } else if (hasActiveSubs && !hasExpiredSubs) {
        status = 'ACTIVE';
        activeOrders++;
      } else if (hasActiveSubs && hasExpiredSubs) {
        status = 'MIXED';
        activeOrders++; // Count as active for now
      }
      
      console.log(`${index + 1}. ${order.orderNo} (${order.member?.user?.name || 'Unknown'}) - ${status}`);
    });
    
    console.log(`\n📈 Summary:`);
    console.log(`  Cancelled orders: ${cancelledOrders}`);
    console.log(`  Expired orders: ${expiredOrders}`);
    console.log(`  Active orders: ${activeOrders}`);
    console.log(`  Total: ${allOrders.length}`);
    
    // Now test specific filters
    console.log('\n🧪 Testing specific filters:\n');
    
    // Test EXPIRED filter
    const expiredFilterOrders = await prisma.productOrder.findMany({
      where: {
        paymentStatus: { not: 'CANCELLED' },
        subscriptions: {
          some: {
            paymentStatus: { not: 'CANCELLED' },
            expiryDate: { lt: today }
          }
        }
      },
      take: 10
    });
    
    console.log(`EXPIRED filter: ${expiredFilterOrders.length} orders`);
    
    // Test NOT_EXPIRED filter
    const activeFilterOrders = await prisma.productOrder.findMany({
      where: {
        paymentStatus: { not: 'CANCELLED' },
        subscriptions: {
          some: {
            paymentStatus: { not: 'CANCELLED' },
            expiryDate: { gte: today }
          }
        }
      },
      take: 10
    });
    
    console.log(`NOT_EXPIRED filter: ${activeFilterOrders.length} orders`);
    
    // Test ALL filter (no filters applied)
    const allFilterOrders = await prisma.productOrder.findMany({
      take: 10
    });
    
    console.log(`ALL filter: ${allFilterOrders.length} orders`);
    
    console.log('\n✅ Filter test complete!');
    
  } catch (error) {
    console.error('❌ Error testing filters:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAllFilter();