const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testLeadModel() {
  try {
    console.log('Testing Lead model...');
    
    // Test if Lead model exists and can be accessed
    const leadCount = await prisma.lead.count();
    console.log('Lead model accessible. Current lead count:', leadCount);
    
    // Test creating a lead
    const testLead = await prisma.lead.create({
      data: {
        name: 'Test Lead',
        mobile: '9876543210',
        email: 'test@example.com',
        plotBuilding: 'Test Building',
        streetArea: 'Test Street',
        pincode: '421202',
        city: 'Test City',
        state: 'Maharashtra',
        isDairyProduct: true,
        notes: 'Test lead creation',
        status: 'NEW'
      }
    });
    
    console.log('Test lead created successfully:', testLead);
    
    // Clean up - delete the test lead
    await prisma.lead.delete({
      where: { id: testLead.id }
    });
    
    console.log('Test lead deleted successfully');
    
  } catch (error) {
    console.error('Error testing Lead model:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testLeadModel();