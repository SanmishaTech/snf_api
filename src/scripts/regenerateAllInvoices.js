const { PrismaClient } = require('@prisma/client');
const { generateInvoiceForOrder } = require('../services/invoiceService');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

async function regenerateAllInvoices() {
  try {
    console.log('🔄 Starting complete invoice regeneration process...');
    
    // Step 1: Get all orders that need invoices
    const ordersToProcess = await prisma.productOrder.findMany({
      where: {
        // Generate invoices for all orders regardless of payment status
      },
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
              where: { isDefault: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc' // Process oldest first to maintain invoice numbering
      }
    });
    
    console.log(`📊 Found ${ordersToProcess.length} orders to process`);
    
    if (ordersToProcess.length === 0) {
      console.log('ℹ️  No orders found. Nothing to regenerate.');
      return;
    }
    
    // Step 2: Clear existing invoice directory
    console.log('🗑️  Clearing existing invoice files...');
    const invoicesDir = path.join(__dirname, '../invoices');
    
    try {
      const files = await fs.readdir(invoicesDir);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      if (pdfFiles.length > 0) {
        console.log(`   Deleting ${pdfFiles.length} existing invoice files...`);
        for (const file of pdfFiles) {
          await fs.unlink(path.join(invoicesDir, file));
          console.log(`   ✓ Deleted ${file}`);
        }
      } else {
        console.log('   No existing invoice files found');
      }
    } catch (error) {
      console.log('   Invoices directory might not exist, will be created during generation');
    }
    
    // Step 3: Separate orders into existing invoices and new ones
    console.log('📋 Categorizing orders...');
    const existingInvoiceOrders = ordersToProcess.filter(order => order.invoiceNo);
    const newInvoiceOrders = ordersToProcess.filter(order => !order.invoiceNo);
    
    console.log(`   📊 Orders with existing invoices: ${existingInvoiceOrders.length}`);
    console.log(`   📊 Orders needing new invoices: ${newInvoiceOrders.length}`);
    
    // Step 4: Process existing invoices (preserve numbers and regenerate PDFs)
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    if (existingInvoiceOrders.length > 0) {
      console.log('📝 Regenerating PDFs for existing invoices (preserving numbers)...');
      
      for (let i = 0; i < existingInvoiceOrders.length; i++) {
        const order = existingInvoiceOrders[i];
        const progress = `(${i + 1}/${existingInvoiceOrders.length})`;
        
        try {
          console.log(`   Regenerating invoice ${order.invoiceNo} for order ${order.orderNo} ${progress}...`);
          
          // Store existing invoice details
          const existingInvoiceNo = order.invoiceNo;
          const existingInvoicePath = order.invoicePath;
          
          // Generate new PDF (this will create a new invoice number temporarily)
          const invoice = await generateInvoiceForOrder(order);
          
          // Rename the generated PDF to use the existing invoice number
          const oldPdfPath = invoice.pdfPath;
          const newFileName = `${existingInvoiceNo}.pdf`;
          const newPdfPath = newFileName;
          const fullOldPath = path.join(__dirname, '../invoices', oldPdfPath);
          const fullNewPath = path.join(__dirname, '../invoices', newPdfPath);
          
          if (oldPdfPath !== newPdfPath) {
            await fs.rename(fullOldPath, fullNewPath);
          }
          
          // Update order with preserved invoice information
          await prisma.productOrder.update({
            where: { id: order.id },
            data: {
              invoiceNo: existingInvoiceNo, // Keep original number
              invoicePath: newPdfPath       // Update path
            }
          });
          
          console.log(`   ✅ Regenerated PDF for existing invoice ${existingInvoiceNo}`);
          successCount++;
          
        } catch (error) {
          console.error(`   ❌ Failed to regenerate invoice for order ${order.orderNo}:`, error.message);
          errorCount++;
          errors.push({
            orderNo: order.orderNo,
            orderId: order.id,
            invoiceNo: order.invoiceNo,
            error: error.message
          });
        }
      }
    }
    
    // Step 5: Generate new invoices for orders without existing invoices
    if (newInvoiceOrders.length > 0) {
      console.log('📝 Generating new invoices for orders without existing invoices...');
      
      for (let i = 0; i < newInvoiceOrders.length; i++) {
        const order = newInvoiceOrders[i];
        const progress = `(${i + 1}/${newInvoiceOrders.length})`;
        
        try {
          console.log(`   Processing order ${order.orderNo} ${progress}...`);
          
          // Generate new invoice
          const invoice = await generateInvoiceForOrder(order);
          
          // Update order with new invoice information
          await prisma.productOrder.update({
            where: { id: order.id },
            data: {
              invoiceNo: invoice.invoiceNo,
              invoicePath: invoice.pdfPath
            }
          });
          
          console.log(`   ✅ Generated new invoice ${invoice.invoiceNo} for order ${order.orderNo}`);
          successCount++;
          
          // Add a small delay to avoid overwhelming the system
          if (i % 10 === 0 && i > 0) {
            console.log(`   ⏳ Processed ${i} orders, taking a brief pause...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error) {
          console.error(`   ❌ Failed to generate invoice for order ${order.orderNo}:`, error.message);
          errorCount++;
          errors.push({
            orderNo: order.orderNo,
            orderId: order.id,
            error: error.message
          });
        }
      }
    }
    
    // Step 6: Summary Report
    console.log('\n📋 INVOICE REGENERATION COMPLETED');
    console.log('=====================================');
    console.log(`✅ Successfully regenerated: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📊 Total processed: ${ordersToProcess.length}`);
    console.log(`🔄 Existing invoices regenerated: ${existingInvoiceOrders.length}`);
    console.log(`🆕 New invoices created: ${newInvoiceOrders.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS ENCOUNTERED:');
      errors.forEach((err, index) => {
        console.log(`${index + 1}. Order ${err.orderNo} (ID: ${err.orderId}): ${err.error}`);
      });
    }
    
    if (successCount > 0) {
      console.log(`\n📁 New invoices saved to: ${path.join(__dirname, '../invoices')}`);
    }
    
    console.log('\n🎉 Invoice regeneration process completed!');
    
  } catch (error) {
    console.error('💥 Critical error in invoice regeneration script:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to create invoices directory if it doesn't exist
async function ensureInvoicesDirectory() {
  const invoicesDir = path.join(__dirname, '../invoices');
  try {
    await fs.access(invoicesDir);
  } catch {
    await fs.mkdir(invoicesDir, { recursive: true });
    console.log('📁 Created invoices directory');
  }
}

// Main execution
async function main() {
  try {
    await ensureInvoicesDirectory();
    await regenerateAllInvoices();
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Handle script interruption gracefully
process.on('SIGINT', async () => {
  console.log('\n⚠️  Script interrupted by user');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the script if called directly
if (require.main === module) {
  main();
}

module.exports = { regenerateAllInvoices };