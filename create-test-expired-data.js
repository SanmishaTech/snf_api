const { PrismaClient } = require('@prisma/client');

async function createTestExpiredData() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔧 Creating test data with expired subscriptions...\n');
    
    // Get a few existing orders to modify
    const existingOrders = await prisma.productOrder.findMany({
      include: {
        subscriptions: true
      },
      take: 3
    });
    
    if (existingOrders.length === 0) {
      console.log('❌ No existing orders found to modify');
      return;
    }
    
    // Set some subscriptions to be expired (past dates)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    console.log('📅 Setting expiry dates:');
    console.log(`Yesterday: ${yesterday.toISOString().split('T')[0]}`);
    console.log(`Last week: ${lastWeek.toISOString().split('T')[0]}\n`);
    
    // Update first order's subscriptions to be expired
    if (existingOrders[0]?.subscriptions.length > 0) {
      const firstOrderSubs = existingOrders[0].subscriptions;
      console.log(`Updating ${firstOrderSubs.length} subscription(s) in order ${existingOrders[0].orderNo} to be expired...`);
      
      for (const sub of firstOrderSubs) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { expiryDate: yesterday }
        });
        console.log(`  ✅ Subscription ${sub.id} set to expire ${yesterday.toISOString().split('T')[0]}`);
      }
    }
    
    // Update second order's subscriptions to be expired (older)
    if (existingOrders[1]?.subscriptions.length > 0) {
      const secondOrderSubs = existingOrders[1].subscriptions;
      console.log(`\nUpdating ${secondOrderSubs.length} subscription(s) in order ${existingOrders[1].orderNo} to be expired (older)...`);
      
      for (const sub of secondOrderSubs) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { expiryDate: lastWeek }
        });
        console.log(`  ✅ Subscription ${sub.id} set to expire ${lastWeek.toISOString().split('T')[0]}`);
      }
    }
    
    console.log('\n🎉 Test data created successfully!');
    console.log('\nNow you can test the expiry filters:');
    console.log('- EXPIRED filter should show the modified orders');
    console.log('- NOT_EXPIRED filter should show the remaining active orders');
    
  } catch (error) {
    console.error('❌ Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestExpiredData();