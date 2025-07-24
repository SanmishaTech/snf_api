// Test script for invoice number generator
const { 
  generateInvoiceNumber, 
  getCurrentFinancialYear, 
  validateInvoiceNumber,
  extractFinancialYear,
  extractSequenceNumber 
} = require('./src/utils/invoiceNumberGenerator');

async function testInvoiceGenerator() {
  try {
    console.log('Testing Invoice Number Generator...');
    
    // Test current financial year
    const currentFY = getCurrentFinancialYear();
    console.log(`Current Financial Year: ${currentFY}`);
    
    // Test validation functions
    console.log('\nTesting validation functions:');
    const testInvoices = ['2526-00001', '2526-12345', '25-00001', 'INV-001', '2526-1234'];
    testInvoices.forEach(invoice => {
      const isValid = validateInvoiceNumber(invoice);
      console.log(`${invoice}: ${isValid ? 'Valid' : 'Invalid'}`);
      if (isValid) {
        console.log(`  Financial Year: ${extractFinancialYear(invoice)}`);
        console.log(`  Sequence: ${extractSequenceNumber(invoice)}`);
      }
    });
    
    // Test invoice number generation
    console.log('\nGenerating invoice numbers:');
    for (let i = 0; i < 3; i++) {
      const invoiceNo = await generateInvoiceNumber();
      console.log(`Invoice ${i + 1}: ${invoiceNo}`);
      console.log(`  Valid: ${validateInvoiceNumber(invoiceNo)}`);
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testInvoiceGenerator();