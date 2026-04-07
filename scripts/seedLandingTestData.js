const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding Test Data ---');

  // 1. Get or Create a Depot
  let depot = await prisma.depot.findFirst();
  if (!depot) {
    console.log('No depot found. Creating a default one...');
    depot = await prisma.depot.create({
      data: {
        name: 'Main Test Depot',
        address: '123 Test Street',
        city: 'Nashik',
        isOnline: true
      }
    });
  }
  console.log(`Using Depot: ${depot.name} (ID: ${depot.id})`);

  // 2. Define Category Names (40)
  const categoryNames = [
    'Milk', 'A2 Ghee', 'Desi Paneer', 'Fresh Curd', 'White Butter', 'Artisan Cheese', 'Creamy Shrikhand', 'Natural Cream', 
    'Indian Sweets', 'Modern Desserts', 'Healthy Breakfast', 'Evening Snacks', 'Refreshing Beverages', 'Whole Grains', 
    'Premium Flours', 'Basmati Rice', 'Organic Pulses', 'Earthly Spices', 'Kitchen Masalas', 'Cold Pressed Oil', 
    'Roasted Nuts', 'Exotic Dry Fruits', 'Tropical Fruits', 'Berry Season', 'Leafy Greens', 'Root Vegetables', 
    'Exotic Vegetables', 'Gourmet Salads', 'Fresh Herbs', 'Wild Honey', 'Fruit Jams', 'Nut Spreads', 
    'Zesty Sauces', 'Homemade Pickles', 'Crispy Papad', 'Bakery Fresh', 'Whole Wheat Bread', 'Oatmeal Biscuits', 
    'Health Drinks', 'Nutrition Supplements'
  ];

  console.log(`Seeding ${categoryNames.length} categories...`);
  const categoryIds = [];
  for (const name of categoryNames) {
    const cat = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, isDairy: name.toLowerCase().includes('milk') || name.toLowerCase().includes('ghee') }
    });
    categoryIds.push(cat.id);
  }

  // 3. Define 100 Tag Pool
  const tagPool = [
    'Organic', 'Fresh', 'Pure', 'Natural', 'Healthy', 'A2', 'Cow', 'Buffalo', 'Premium', 'Luxury', 'Bestseller', 'Trending', 
    'Top Rated', 'New', 'Seasonal', 'Dairy', 'Farm Fresh', 'Artisan', 'Traditional', 'Homemade', 'Pesticide-Free', 'Non-GMO', 
    'Sustainable', 'Eco-Friendly', 'Recyclable', 'High-Protein', 'Low-Fat', 'High-Fiber', 'Gluten-Free', 'Vegan', 'Keto', 'Paleo', 
    'Immunity-Booster', 'Energy', 'Detox', 'Wholesome', 'Nutrient-Rich', 'Vitamin-C', 'Vitamin-D', 'Calcium-Rich', 'Probiotic', 
    'Digestive', 'Gut-Health', 'Light', 'Creamy', 'Crunchy', 'Savory', 'Sweet', 'Tangy', 'Spicy', 'Mild', 'Hot', 'Smoked', 
    'Roasted', 'Salted', 'Unsalted', 'Zero-Sugar', 'No-Additives', 'No-Preservatives', 'Small-Batch', 'Single-Origin', 'Local', 
    'Village-Style', 'Hand-Pressed', 'Sun-Dried', 'Cold-Pressed', 'Stone-Ground', 'Traditional-Method', 'Authentic', 'Regional', 
    'Indian', 'Continental', 'Mediterranean', 'Middle-Eastern', 'Asian', 'Ethnic', 'Fusion', 'Comfort-Food', 'Fast-Cooking', 
    'Ready-to-Eat', 'Instant', 'Microwavable', 'Tiffin-Friendly', 'Office-Snack', 'Kids-Favorite', 'Party-Pack', 'Combo', 
    'Bulk', 'Value-Pack', 'Economical', 'Budget-Friendly', 'Exclusive', 'Limited-Edition', 'Rare', 'Heritage', 'Ancient-Grain', 
    'Millet', 'Superfood', 'Seeds', 'Chia', 'Flax', 'Hemp'
  ];

  // 4. Create 50 Products
  console.log('Seeding 50 products...');
  for (let i = 1; i <= 50; i++) {
    const catId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
    const catName = categoryNames[categoryIds.indexOf(catId)];
    
    // Pick 5 random tags
    const shuffled = [...tagPool].sort(() => 0.5 - Math.random());
    const selectedTags = shuffled.slice(0, 5).join(', ');

    const productName = `Test ${catName} Product ${i}`;
    const product = await prisma.product.create({
      data: {
        name: productName,
        categoryId: catId,
        tags: selectedTags,
        description: `This is a high quality test product for ${catName}. Packed with ${selectedTags}.`,
        isDairyProduct: catName.toLowerCase().includes('milk') || catName.toLowerCase().includes('ghee')
      }
    });

    // 5. Create Depot Product Variant (Crucial for landing page visibility)
    await prisma.depotProductVariant.create({
      data: {
        depotId: depot.id,
        productId: product.id,
        name: `${productName} - 500ml/Standard`,
        mrp: 150 + (i * 2),
        salesPrice: 120 + (i * 2),
        buyOncePrice: 120 + (i * 2),
        minimumQty: 1,
        closingQty: 100,
        notInStock: false,
        isHidden: false
      }
    });
  }

  console.log('--- Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
