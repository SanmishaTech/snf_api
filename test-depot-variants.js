// Test script to check depot and variant data
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testDepotAndVariants() {
  try {
    console.log('=== Testing Depot and Variant Data ===\n');
    
    // Check if depot 1 exists
    console.log('1. Checking if depot 1 exists...');
    const depot1 = await prisma.depot.findUnique({
      where: { id: 1 }
    });
    console.log('Depot 1:', depot1 ? `Found: ${depot1.name}` : 'Not found');
    
    // Check if product 1 exists
    console.log('\n2. Checking if product 1 exists...');
    const product1 = await prisma.product.findUnique({
      where: { id: 1 },
      include: {
        category: true
      }
    });
    console.log('Product 1:', product1 ? `Found: ${product1.name} (isDairy: ${product1.isDairyProduct})` : 'Not found');
    
    // Check depot variants for product 1
    console.log('\n3. Checking depot variants for product 1...');
    const depotVariants = await prisma.depotProductVariant.findMany({
      where: {
        productId: 1
      },
      include: {
        depot: true,
        product: true
      }
    });
    console.log(`Found ${depotVariants.length} depot variants for product 1:`);
    depotVariants.forEach(variant => {
      console.log(`  - Variant ${variant.id}: ${variant.name} (Depot: ${variant.depot.name}, MRP: ${variant.mrp}, BuyOnce: ${variant.buyOncePrice})`);
    });
    
    // Check depot variants for depot 1
    console.log('\n4. Checking all depot variants for depot 1...');
    const depot1Variants = await prisma.depotProductVariant.findMany({
      where: {
        depotId: 1,
        notInStock: false,
        isHidden: false
      },
      include: {
        product: true
      }
    });
    console.log(`Found ${depot1Variants.length} active variants in depot 1:`);
    depot1Variants.forEach(variant => {
      console.log(`  - Product ${variant.product.name}: ${variant.name} (MRP: ${variant.mrp}, BuyOnce: ${variant.buyOncePrice})`);
    });
    
    // Test the exact query used by the backend
    console.log('\n5. Testing backend query for depot 1...');
    const productsWithVariants = await prisma.product.findMany({
      where: {
        depotProductVariants: {
          some: {
            depotId: 1,
            notInStock: false,
            isHidden: false,
          },
        },
      },
      select: {
        id: true,
        name: true,
        isDairyProduct: true,
        depotProductVariants: {
          where: {
            depotId: 1,
            notInStock: false,
            isHidden: false,
          },
          select: {
            id: true,
            name: true,
            mrp: true,
            buyOncePrice: true,
          },
        },
      },
      take: 5
    });
    
    console.log(`Backend query returned ${productsWithVariants.length} products:`);
    productsWithVariants.forEach(product => {
      console.log(`  - Product ${product.id}: ${product.name} (isDairy: ${product.isDairyProduct}, variants: ${product.depotProductVariants.length})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDepotAndVariants();