const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkDeliveryInstructions() {
  try {
    console.log('Checking recent subscriptions with delivery instructions...');
    
    const subscriptions = await prisma.subscription.findMany({
      select: { 
        id: true, 
        deliveryInstructions: true,
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('Recent subscriptions:');
    console.log(JSON.stringify(subscriptions, null, 2));

    const withInstructions = subscriptions.filter(sub => sub.deliveryInstructions);
    console.log(`\nFound ${withInstructions.length} subscriptions with delivery instructions out of ${subscriptions.length} total.`);

    if (withInstructions.length > 0) {
      console.log('\nSubscriptions with instructions:');
      withInstructions.forEach(sub => {
        console.log(`ID: ${sub.id}, Instructions: "${sub.deliveryInstructions}"`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkDeliveryInstructions();
