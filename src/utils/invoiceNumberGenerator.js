/**
 * Invoice Number Generator Utility
 * 
 * Generates invoice numbers in the format: YYNN-NNNNN
 * Where:
 * - YYNN represents the financial year (e.g., 2526 for FY 2025-26)
 * - NNNNN is a 5-digit incrementing sequence number (00001, 00002, etc.)
 * 
 * Financial Year Logic:
 * - Runs from April 1st to March 31st
 * - April 2025 to March 2026 = FY 2025-26 = "2526"
 * - Sequence resets to 00001 at the start of each financial year
 * 
 * Examples:
 * - First invoice of FY 2025-26: 2526-00001
 * - Second invoice of FY 2025-26: 2526-00002
 * - First invoice of FY 2026-27: 2627-00001
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Generate financial year based invoice number in format: YYNN-NNNNN
 * Where YYNN is the financial year (e.g., 2526 for FY 2025-26)
 * And NNNNN is the incrementing sequence number
 * 
 * @returns {Promise<string>} Generated invoice number
 */
const generateInvoiceNumber = async () => {
  try {
    // Get current financial year
    const financialYear = getCurrentFinancialYear();

    // Use a transaction to ensure atomicity and prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // Get the last invoice number for this financial year with row locking
      const lastInvoice = await tx.productOrder.findFirst({
        where: {
          invoiceNo: {
            startsWith: `${financialYear}-`
          }
        },
        orderBy: {
          invoiceNo: 'desc'
        },
        select: {
          invoiceNo: true
        }
      });

      let sequenceNumber = 1;

      if (lastInvoice && lastInvoice.invoiceNo) {
        // Extract sequence number from last invoice
        const lastSequence = lastInvoice.invoiceNo.split('-')[1];
        sequenceNumber = parseInt(lastSequence, 10) + 1;
      }

      // Format sequence number with leading zeros (5 digits)
      const formattedSequence = sequenceNumber.toString().padStart(5, '0');

      // Generate final invoice number
      const invoiceNumber = `${financialYear}-${formattedSequence}`;

      return invoiceNumber;
    });

    return result;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    throw new Error('Failed to generate invoice number');
  }
};

/**
 * Generate financial year based SNF invoice number in format: SNF-YYNN-NNNNN
 * Where YYNN is the financial year (e.g., 2526 for FY 2025-26)
 * And NNNNN is the incrementing sequence number specific to SNF orders
 * 
 * @returns {Promise<string>} Generated SNF invoice number
 */
const generateSNFInvoiceNumber = async () => {
  try {
    // Get current financial year
    const financialYear = getCurrentFinancialYear();
    const prefix = `SNF-${financialYear}`;

    // Use a transaction to ensure atomicity and prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // Get the last SNF invoice number for this financial year
      const lastInvoice = await tx.sNFOrder.findFirst({
        where: {
          invoiceNo: {
            startsWith: `${prefix}-`
          }
        },
        orderBy: {
          invoiceNo: 'desc'
        },
        select: {
          invoiceNo: true
        }
      });

      let sequenceNumber = 1;

      if (lastInvoice && lastInvoice.invoiceNo) {
        // Extract sequence number from last invoice (SNF-YYNN-NNNNN)
        const parts = lastInvoice.invoiceNo.split('-');
        if (parts.length >= 3) {
          const lastSequence = parts[2]; // Get the NNNNN part
          sequenceNumber = parseInt(lastSequence, 10) + 1;
        }
      }

      // Format sequence number with leading zeros (5 digits)
      const formattedSequence = sequenceNumber.toString().padStart(5, '0');

      // Generate final invoice number
      const invoiceNumber = `${prefix}-${formattedSequence}`;

      return invoiceNumber;
    });

    return result;
  } catch (error) {
    console.error('Error generating SNF invoice number:', error);
    throw new Error('Failed to generate SNF invoice number');
  }
};

/**
 * Get current financial year in YYNN format
 * Financial year runs from April 1st to March 31st
 * Examples:
 * - April 2025 to March 2026 = "2526"
 * - April 2024 to March 2025 = "2425"
 * 
 * @returns {string} Financial year string in YYNN format
 */
const getCurrentFinancialYear = () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed

  if (currentMonth >= 4) {
    // April to December: Current year to next year
    // e.g., April 2025 = FY 2025-26 = "2526"
    return `${currentYear.toString().slice(-2)}${(currentYear + 1).toString().slice(-2)}`;
  } else {
    // January to March: Previous year to current year
    // e.g., February 2026 = FY 2025-26 = "2526"
    return `${(currentYear - 1).toString().slice(-2)}${currentYear.toString().slice(-2)}`;
  }
};

/**
 * Validate invoice number format
 * @param {string} invoiceNo - Invoice number to validate
 * @returns {boolean} True if valid format
 */
const validateInvoiceNumber = (invoiceNo) => {
  if (!invoiceNo || typeof invoiceNo !== 'string') {
    return false;
  }

  // Check format: YYNN-NNNNN (4 digits, hyphen, 5 digits)
  const invoicePattern = /^\d{4}-\d{5}$/;
  return invoicePattern.test(invoiceNo);
};

/**
 * Extract financial year from invoice number
 * @param {string} invoiceNo - Invoice number
 * @returns {string|null} Financial year or null if invalid
 */
const extractFinancialYear = (invoiceNo) => {
  if (!validateInvoiceNumber(invoiceNo)) {
    return null;
  }

  return invoiceNo.split('-')[0];
};

/**
 * Extract sequence number from invoice number
 * @param {string} invoiceNo - Invoice number
 * @returns {number|null} Sequence number or null if invalid
 */
const extractSequenceNumber = (invoiceNo) => {
  if (!validateInvoiceNumber(invoiceNo)) {
    return null;
  }

  return parseInt(invoiceNo.split('-')[1], 10);
};

module.exports = {
  generateInvoiceNumber,
  generateSNFInvoiceNumber,
  getCurrentFinancialYear,
  validateInvoiceNumber,
  extractFinancialYear,
  extractSequenceNumber
};
