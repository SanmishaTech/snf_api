const { PrismaClient } = require('@prisma/client');
const { generateInvoiceForOrder } = require('../services/invoiceService');
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

    // Generate invoice
    const invoice = await generateInvoiceForOrder(recentOrder);
    
    console.log('\n✓ Invoice generated successfully!');
    console.log(`  - Invoice No: ${invoice.invoiceNo}`);
    console.log(`  - PDF Path: ${invoice.fullPath}`);
    
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
    
    console.log('\nInvoice generation test completed successfully!');
    
  } catch (error) {
    console.error('Error during invoice generation test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testInvoiceGeneration();
