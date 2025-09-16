const { PrismaClient } = require('@prisma/client');
const { generateInvoiceForOrder } = require('../src/services/invoiceService');
const path = require('path');
const fs = require('fs').promises;

const prisma = new PrismaClient();

/**
 * Script to regenerate all invoices for existing orders
 * This will update the invoice files with the latest template and styling
 */

const BATCH_SIZE = 10; // Process orders in batches to avoid memory issues
let processedCount = 0;
let successCount = 0;
let failureCount = 0;
let skippedCount = 0;

const logProgress = (message, isError = false) => {
  const timestamp = new Date().toISOString();
  const logLevel = isError ? 'ERROR' : 'INFO';
  console.log(`[${timestamp}] [${logLevel}] ${message}`);
};

const regenerateInvoicesForBatch = async (orders) => {
  const promises = orders.map(async (order) => {
    try {
      logProgress(`Processing order: ${order.orderNo} (ID: ${order.id})`);
      
      // Check if order has subscriptions
      if (!order.subscriptions || order.subscriptions.length === 0) {
        logProgress(`Skipping order ${order.orderNo} - no subscriptions found`, true);
        skippedCount++;
        return;
      }

      // Generate new invoice
      const invoice = await generateInvoiceForOrder(order);
      
      // Update the order with new invoice information
      await prisma.productOrder.update({
        where: { id: order.id },
        data: {
          invoiceNo: invoice.invoiceNo,
          invoicePath: invoice.pdfPath
        }
      });

      logProgress(`✅ Successfully regenerated invoice for order ${order.orderNo} -> ${invoice.invoiceNo}`);
      successCount++;
      
    } catch (error) {
      logProgress(`❌ Failed to regenerate invoice for order ${order.orderNo}: ${error.message}`, true);
      console.error(error);
      failureCount++;
    }
    
    processedCount++;
  });

  await Promise.all(promises);
};

const regenerateAllInvoices = async () => {
  try {
    logProgress('🚀 Starting invoice regeneration process...');
    
    // Get total count for progress tracking
    const totalCount = await prisma.productOrder.count({
      where: {
        OR: [
          { invoiceNo: { not: null } },
          { invoicePath: { not: null } }
        ]
      }
    });

    logProgress(`Found ${totalCount} orders with existing invoices to regenerate`);

    if (totalCount === 0) {
      logProgress('No orders found with existing invoices. Exiting.');
      return;
    }

    // Process in batches
    let offset = 0;
    while (offset < totalCount) {
      logProgress(`Processing batch ${Math.floor(offset / BATCH_SIZE) + 1}/${Math.ceil(totalCount / BATCH_SIZE)} (Orders ${offset + 1}-${Math.min(offset + BATCH_SIZE, totalCount)})`);
      
      const orders = await prisma.productOrder.findMany({
        where: {
          OR: [
            { invoiceNo: { not: null } },
            { invoicePath: { not: null } }
          ]
        },
        skip: offset,
        take: BATCH_SIZE,
        include: {
          subscriptions: {
            include: {
              deliveryAddress: true,
              deliveryScheduleEntries: {
                orderBy: {
                  deliveryDate: 'asc'
                }
              },
              depotProductVariant: {
                include: {
                  depot: true,
                  product: true,
                },
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      await regenerateInvoicesForBatch(orders);
      offset += BATCH_SIZE;

      // Log progress
      logProgress(`Batch completed. Progress: ${processedCount}/${totalCount} orders processed`);
    }

    // Final statistics
    logProgress('📊 Invoice regeneration completed!');
    logProgress(`Total Processed: ${processedCount}`);
    logProgress(`✅ Successful: ${successCount}`);
    logProgress(`❌ Failed: ${failureCount}`);
    logProgress(`⏭️  Skipped: ${skippedCount}`);
    
    if (failureCount > 0) {
      logProgress(`⚠️  ${failureCount} invoices failed to regenerate. Check the error logs above.`, true);
    }

  } catch (error) {
    logProgress(`💥 Critical error during invoice regeneration: ${error.message}`, true);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// Add command line options
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const specificOrderId = args.find(arg => arg.startsWith('--order-id='))?.split('=')[1];
const specificOrderNo = args.find(arg => arg.startsWith('--order-no='))?.split('=')[1];

const regenerateSpecificOrder = async (orderIdentifier, isOrderId = false) => {
  try {
    logProgress(`🎯 Regenerating invoice for specific order: ${orderIdentifier}`);
    
    const whereClause = isOrderId 
      ? { id: parseInt(orderIdentifier) }
      : { orderNo: orderIdentifier };

    const order = await prisma.productOrder.findUnique({
      where: whereClause,
      include: {
        subscriptions: {
          include: {
            deliveryAddress: true,
            deliveryScheduleEntries: {
              orderBy: {
                deliveryDate: 'asc'
              }
            },
            depotProductVariant: {
              include: {
                depot: true,
                product: true,
              },
            }
          }
        }
      }
    });

    if (!order) {
      logProgress(`❌ Order not found: ${orderIdentifier}`, true);
      return;
    }

    await regenerateInvoicesForBatch([order]);
    
  } catch (error) {
    logProgress(`💥 Error regenerating specific order: ${error.message}`, true);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
};

// Show help
const showHelp = () => {
  console.log(`
📄 Invoice Regeneration Script

Usage:
  node regenerateInvoices.js [options]

Options:
  --dry-run              Show what would be regenerated without actually doing it
  --order-id=123         Regenerate invoice for specific order ID
  --order-no=ORD-123     Regenerate invoice for specific order number
  --help                 Show this help message

Examples:
  node regenerateInvoices.js                    # Regenerate all invoices
  node regenerateInvoices.js --dry-run          # Preview what will be regenerated
  node regenerateInvoices.js --order-id=123    # Regenerate specific order by ID
  node regenerateInvoices.js --order-no=ORD-123 # Regenerate specific order by number
`);
};

// Main execution
if (args.includes('--help')) {
  showHelp();
} else if (dryRun) {
  logProgress('🔍 DRY RUN MODE - No invoices will actually be regenerated');
  // Add dry run logic here if needed
} else if (specificOrderId) {
  regenerateSpecificOrder(specificOrderId, true);
} else if (specificOrderNo) {
  regenerateSpecificOrder(specificOrderNo, false);
} else {
  regenerateAllInvoices();
}
