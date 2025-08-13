// Script to create test depot variants for product 1
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTestData() {
  try {
    console.log('=== Creating Test Depot Variants ===\n');
    
    // Check if depot 1 exists, create if not
    let depot1 = await prisma.depot.findUnique({ where: { id: 1 } });
    if (!depot1) {
      console.log('Creating depot 1...');
      depot1 = await prisma.depot.create({
        data: {
          id: 1,
          name: 'Main Depot',
          address: 'Test Address',
          isOnline: true
        }
      });
      console.log('Depot 1 created:', depot1.name);
    } else {
      console.log('Depot 1 already exists:', depot1.name);
    }
    
    // Check if product 1 exists
    const product1 = await prisma.product.findUnique({ where: { id: 1 } });
    if (!product1) {
      console.log('Product 1 not found! Please ensure product 1 exists.');
      return;
    }
    console.log('Product 1 found:', product1.name);
    
    // Check if depot variants already exist for product 1 in depot 1
    const existingVariants = await prisma.depotProductVariant.findMany({
      where: {
        productId: 1,
        depotId: 1
      }
    });
    
    if (existingVariants.length > 0) {
      console.log(`Found ${existingVariants.length} existing variants for product 1 in depot 1`);
      existingVariants.forEach(variant => {
        console.log(`  - ${variant.name}: MRP ${variant.mrp}, BuyOnce ${variant.buyOncePrice}`);
      });
    } else {
      console.log('No existing variants found. Creating test variants...');
      
      // Create test variants
      const variants = [
        {
          name: '500ml',
          mrp: 25.00,
          buyOncePrice: 23.00,
          minimumQty: 1,
          closingQty: 100,
          notInStock: false,
          isHidden: false
        },
        {
          name: '1L',
          mrp: 45.00,
          buyOncePrice: 42.00,
          minimumQty: 1,
          closingQty: 50,
          notInStock: false,
          isHidden: false
        }
      ];
      
      for (const variantData of variants) {
        const variant = await prisma.depotProductVariant.create({
          data: {
            ...variantData,
            productId: 1,
            depotId: 1
          }
        });
        console.log(`Created variant: ${variant.name} (ID: ${variant.id})`);
      }
    }
    
    console.log('\nTest data creation completed!');
    
  } catch (error) {
    console.error('Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestData();