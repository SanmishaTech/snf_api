const { PrismaClient } = require('@prisma/client');
const { generateInvoiceForOrder } = require('../services/invoiceService');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

async function regenerateAllInvoicesKeepNumbers() {
  try {
    console.log('🔄 Starting invoice regeneration (preserving existing numbers)...');
    
    // Step 1: Get all orders that have invoices (paid orders with invoice numbers)
    const existingInvoiceOrders = await prisma.productOrder.findMany({
      where: {
        paymentStatus: 'PAID',
        invoiceNo: { not: null }
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
      },
      orderBy: {
        invoiceNo: 'asc' // Order by invoice number to maintain sequence
      }
    });
    
    console.log(`📊 Found ${existingInvoiceOrders.length} orders with existing invoices`);
    
    if (existingInvoiceOrders.length === 0) {
      console.log('ℹ️  No orders with existing invoices found.');
      return;
    }
    
    // Step 2: Clear existing invoice PDF files (but keep the numbers)
    console.log('🗑️  Clearing existing invoice PDF files...');
    const invoicesDir = path.join(__dirname, '../invoices');
    
    try {
      const files = await fs.readdir(invoicesDir);
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      if (pdfFiles.length > 0) {
        console.log(`   Deleting ${pdfFiles.length} existing PDF files...`);
        for (const file of pdfFiles) {
          await fs.unlink(path.join(invoicesDir, file));
          console.log(`   ✓ Deleted ${file}`);
        }
      } else {
        console.log('   No existing PDF files found');
      }
    } catch (error) {
      console.log('   Invoices directory might not exist, will be created during generation');
    }
    
    // Step 3: Regenerate PDFs using existing invoice numbers
    console.log('📝 Regenerating invoice PDFs with existing numbers...');
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < existingInvoiceOrders.length; i++) {
      const order = existingInvoiceOrders[i];
      const progress = `(${i + 1}/${existingInvoiceOrders.length})`;
      
      try {
        console.log(`   Regenerating invoice ${order.invoiceNo} for order ${order.orderNo} ${progress}...`);
        
        // Temporarily store the existing invoice number
        const existingInvoiceNo = order.invoiceNo;
        
        // Generate new PDF (this will create a new invoice number, but we'll override it)
        const invoice = await generateInvoiceForOrder(order);
        
        // Create the PDF with the existing invoice number by manipulating the file
        const oldPdfPath = invoice.pdfPath;
        const newFileName = `${existingInvoiceNo}.pdf`;
        const newPdfPath = newFileName;
        const fullOldPath = path.join(invoicesDir, oldPdfPath);
        const fullNewPath = path.join(invoicesDir, newPdfPath);
        
        // Rename the generated PDF to use the existing invoice number
        if (oldPdfPath !== newPdfPath) {
          await fs.rename(fullOldPath, fullNewPath);
        }
        
        // Update order with the preserved invoice information
        await prisma.productOrder.update({
          where: { id: order.id },
          data: {
            invoiceNo: existingInvoiceNo, // Keep the original number
            invoicePath: newPdfPath       // Update with new path
          }
        });
        
        console.log(`   ✅ Regenerated PDF for invoice ${existingInvoiceNo}`);
        successCount++;
        
        // Add a small delay to avoid overwhelming the system
        if (i % 10 === 0 && i > 0) {
          console.log(`   ⏳ Processed ${i} invoices, taking a brief pause...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
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
    
    // Step 4: Summary Report
    console.log('\n📋 INVOICE REGENERATION COMPLETED');
    console.log('=====================================');
    console.log(`✅ Successfully regenerated: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📊 Total processed: ${existingInvoiceOrders.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS ENCOUNTERED:');
      errors.forEach((err, index) => {
        console.log(`${index + 1}. Invoice ${err.invoiceNo} (Order ${err.orderNo}): ${err.error}`);
      });
    }
    
    if (successCount > 0) {
      console.log(`\n📁 Regenerated PDFs saved to: ${path.join(__dirname, '../invoices')}`);
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
    await regenerateAllInvoicesKeepNumbers();
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

module.exports = { regenerateAllInvoicesKeepNumbers };