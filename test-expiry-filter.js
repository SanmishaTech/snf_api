const { PrismaClient } = require('@prisma/client');

async function testExpiryFilter() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Testing expiry filter logic...\n');
    
    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    console.log('Today:', today.toISOString().split('T')[0]);
    
    // Get all orders with their subscriptions
    const allOrders = await prisma.productOrder.findMany({
      include: {
        subscriptions: {
          select: {
            id: true,
            expiryDate: true,
            paymentStatus: true,
            product: {
              select: { name: true }
            }
          }
        },
        member: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      },
      take: 10 // Limit to first 10 for testing
    });
    
    console.log(`\n📊 Found ${allOrders.length} orders to analyze:\n`);
    
    allOrders.forEach((order, index) => {
      console.log(`Order ${index + 1}: ${order.orderNo} (${order.member?.user?.name || 'Unknown'})`);
      
      const expiredSubs = [];
      const activeSubs = [];
      
      order.subscriptions.forEach(sub => {
        if (sub.paymentStatus === 'CANCELLED') {
          console.log(`  - ${sub.product.name}: CANCELLED (ignored)`);
          return;
        }
        
        const expiryDate = new Date(sub.expiryDate);
        expiryDate.setHours(0, 0, 0, 0);
        const isExpired = expiryDate < today;
        
        if (isExpired) {
          expiredSubs.push(sub);
          console.log(`  - ${sub.product.name}: EXPIRED (${sub.expiryDate})`);
        } else {
          activeSubs.push(sub);
          console.log(`  - ${sub.product.name}: ACTIVE (${sub.expiryDate})`);
        }
      });
      
      const orderStatus = expiredSubs.length > 0 && activeSubs.length === 0 ? 'ALL_EXPIRED' :
                         activeSubs.length > 0 && expiredSubs.length === 0 ? 'ALL_ACTIVE' :
                         expiredSubs.length > 0 && activeSubs.length > 0 ? 'MIXED' : 'NO_SUBS';
      
      console.log(`  → Order Status: ${orderStatus}\n`);
    });
    
    // Test the current filter logic
    console.log('🧪 Testing current filter logic:\n');
    
    // Test EXPIRED filter
    const expiredOrders = await prisma.productOrder.findMany({
      where: {
        paymentStatus: { not: 'CANCELLED' },
        subscriptions: {
          some: {
            paymentStatus: { not: 'CANCELLED' },
            expiryDate: { lt: today }
          }
        }
      },
      include: {
        subscriptions: {
          select: {
            expiryDate: true,
            paymentStatus: true,
            product: { select: { name: true } }
          }
        }
      },
      take: 5
    });
    
    console.log(`EXPIRED filter found ${expiredOrders.length} orders`);
    
    // Test NOT_EXPIRED filter
    const activeOrders = await prisma.productOrder.findMany({
      where: {
        paymentStatus: { not: 'CANCELLED' },
        subscriptions: {
          some: {
            paymentStatus: { not: 'CANCELLED' },
            expiryDate: { gte: today }
          }
        }
      },
      include: {
        subscriptions: {
          select: {
            expiryDate: true,
            paymentStatus: true,
            product: { select: { name: true } }
          }
        }
      },
      take: 5
    });
    
    console.log(`NOT_EXPIRED filter found ${activeOrders.length} orders`);
    
    // Check for overlap
    const expiredOrderIds = new Set(expiredOrders.map(o => o.id));
    const activeOrderIds = new Set(activeOrders.map(o => o.id));
    const overlap = [...expiredOrderIds].filter(id => activeOrderIds.has(id));
    
    console.log(`\n⚠️  Overlap between filters: ${overlap.length} orders appear in both results`);
    if (overlap.length > 0) {
      console.log('Overlapping order IDs:', overlap);
    }
    
  } catch (error) {
    console.error('❌ Error testing expiry filter:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testExpiryFilter();