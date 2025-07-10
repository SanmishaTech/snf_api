const { PrismaClient } = require('@prisma/client');
const { generateInvoiceForOrder } = require('../services/invoiceService');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function testInvoiceGeneration() {
  try {
    // Get the most recent product order
    const recentOrder = await prisma.productOrder.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptions: {
          include: {
            product: true,
            depotProductVariant: true,
            deliveryAddress: true
          }
        },
        member: {
          include: {
            user: true,
            addresses: {
              where: { isDefault: true },
              take: 1
            }
          }
        }
      }
    });

    if (!recentOrder) {
      console.log('No orders found in the database');
      return;
    }

    console.log(`Testing invoice generation for order: ${recentOrder.orderNo}`);
    console.log(`Order details:
      - Member: ${recentOrder.member.name}
      - Total Amount: ₹${recentOrder.totalAmount}
      - Payment Status: ${recentOrder.paymentStatus}
      - Subscriptions: ${recentOrder.subscriptions.length}`);

    console.log('\nSubscription Details:');
    recentOrder.subscriptions.forEach((sub, index) => {
      console.log(`  Subscription ${index + 1}:`);
      console.log(`    - Product: ${sub.depotProductVariant?.name || sub.product?.name}`);
      console.log(`    - Period: ${sub.period} days`);
      console.log(`    - Quantity: ${sub.totalQty}`);
      console.log(`    - Amount: ₹${sub.amount}`);
      console.log(`    - HSN Code: ${sub.depotProductVariant?.hsnCode || 'N/A'}`);
    });

    console.log('\nGenerating invoice...');
    
    try {
      // Generate invoice
      const invoice = await generateInvoiceForOrder(recentOrder);
      
      console.log('✓ Invoice generation completed!');
      console.log(`  - Invoice No: ${invoice.invoiceNo}`);
      console.log(`  - PDF Path: ${invoice.fullPath}`);
      
      // Check if file exists
      if (fs.existsSync(invoice.fullPath)) {
        const stats = fs.statSync(invoice.fullPath);
        console.log(`  - File size: ${stats.size} bytes`);
        console.log('  - File exists: YES');
      } else {
        console.log('  - File exists: NO');
      }
      
      // Update the order with invoice information if not already set
      if (!recentOrder.invoiceNo || !recentOrder.invoicePath) {
        await prisma.productOrder.update({
          where: { id: recentOrder.id },
          data: {
            invoiceNo: invoice.invoiceNo,
            invoicePath: invoice.pdfPath
          }
        });
        console.log('  - Order updated with invoice information');
      }
      
    } catch (invoiceError) {
      console.error('\nError during invoice generation:', invoiceError);
      console.error('Stack trace:', invoiceError.stack);
    }
    
    console.log('\nInvoice generation test completed!');
    
  } catch (error) {
    console.error('Error during test:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testInvoiceGeneration();
