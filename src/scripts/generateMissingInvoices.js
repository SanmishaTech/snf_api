const { PrismaClient } = require('@prisma/client');
const { generateInvoiceForOrder } = require('../services/invoiceService');

const prisma = new PrismaClient();

async function generateMissingInvoices() {
  try {
    console.log('Starting invoice generation for existing orders...');
    
    // Find all orders without invoice information
    const ordersWithoutInvoice = await prisma.productOrder.findMany({
      where: {
        OR: [
          { invoiceNo: null },
          { invoicePath: null }
        ]
      },
      include: {
        subscriptions: {
          include: {
            product: true,
            depotProductVariant: true
          }
        },
        member: {
          include: {
            user: true
          }
        }
      }
    });
    
    console.log(`Found ${ordersWithoutInvoice.length} orders without invoices`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const order of ordersWithoutInvoice) {
      try {
        console.log(`Processing order ${order.orderNo}...`);
        
        // Generate invoice
        const invoice = await generateInvoiceForOrder(order);
        
        // Update order with invoice information
        await prisma.productOrder.update({
          where: { id: order.id },
          data: {
            invoiceNo: invoice.invoiceNo,
            invoicePath: invoice.pdfPath
          }
        });
        
        console.log(`✓ Generated invoice ${invoice.invoiceNo} for order ${order.orderNo}`);
        successCount++;
      } catch (error) {
        console.error(`✗ Failed to generate invoice for order ${order.orderNo}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\nInvoice generation completed:');
    console.log(`✓ Successfully generated: ${successCount}`);
    console.log(`✗ Failed: ${errorCount}`);
    
  } catch (error) {
    console.error('Error in invoice generation script:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
generateMissingInvoices();
