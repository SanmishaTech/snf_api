const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateInvoicePdf } = require('../utils/invoiceGeneratorEnhanced');
const path = require('path');
const fs = require('fs').promises;
const { numberToWords } = require('../utils/numberToWords');
const { generateSNFInvoiceNumber } = require('../utils/invoiceNumberGenerator');

/**
 * Generates an invoice PDF for a SNF order
 * @param {Object} snfOrder - The SNF order with all relations loaded
 * @returns {Promise<Object>} Object containing invoice number and file path
 */
const generateInvoiceForSNFOrder = async (snfOrder) => {
  try {
    // Generate financial year based SNF invoice number
    const invoiceNo = await generateSNFInvoiceNumber();
    
    // Get member details if available
    let member = null;
    if (snfOrder.memberId) {
      member = await prisma.member.findUnique({
        where: { id: snfOrder.memberId },
        include: {
          user: true
        }
      });
    }

    // Calculate invoice amounts (SNF orders typically don't have tax)
    const subtotal = snfOrder.subtotal;
    const deliveryFee = snfOrder.deliveryFee || 0;
    const cgstRate = 0;
    const sgstRate = 0;
    const cgstAmount = 0;
    const sgstAmount = 0;
    const totalAmount = snfOrder.totalAmount;

    // Prepare customer data from order details
    const customerInfo = {
      memberName: snfOrder.name,
      mobile: snfOrder.mobile,
      email: snfOrder.email || member?.user?.email || '',
      addressLines: [
        snfOrder.name,
        snfOrder.addressLine1,
        snfOrder.addressLine2 || '',
      ].filter(Boolean),
      city: snfOrder.city,
      state: snfOrder.state || '',
      pincode: snfOrder.pincode,
      gstin: null // SNF orders typically don't have GSTIN
    };

    // Get depot information if available
    let depotInfo = null;
    if (snfOrder.depot) {
      depotInfo = {
        name: snfOrder.depot.name,
        address: snfOrder.depot.address,
        contactPerson: snfOrder.depot.contactPerson,
        contactNumber: snfOrder.depot.contactNumber
      };
    }

    // Check for QR code image
    const qrCodePath = path.join(__dirname, '..', '..', 'assets', 'payment-qr-code.jpeg');
    let qrCodeExists = false;
    try {
      await fs.access(qrCodePath);
      qrCodeExists = true;
    } catch (error) {
      console.log('QR code image not found at:', qrCodePath);
    }

    // Prepare data for PDF generation
    const invoiceData = {
      invoiceNumber: invoiceNo,
      invoiceDate: snfOrder.createdAt || new Date(),
      orderNo: snfOrder.orderNo,
      qrCodePath: qrCodeExists ? qrCodePath : null,
      member: customerInfo,
      SNFlobal: {
        name: 'Sarkhot Natural Farms',
        addressLines: [
          'B/3 Prabhat Society,',
          'Mukherjee Road, Near CKP Hall,',
          'Dombivli East',
          '421202',
          'Thane',
          'Maharashtra'
        ],
        city: 'Dombivli East',
        pincode: '421202',
        gstinUin: '27AAHCB7744A1ZT',
        email: 'sarkhotnaturalfarms@gmail.com'
      },
      depot: depotInfo,
      items: generateInvoiceItemsFromSNFOrder(snfOrder),
      totals: {
        amountBeforeTax: subtotal,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate: 0,
        igstAmount: 0,
        deliveryFee,
        totalAmount,
        amountInWords: numberToWords(totalAmount)
      },
      paymentDetails: {
        walletAmount: 0, // SNF orders don't use wallet
        paidAmount: snfOrder.paymentStatus === 'PAID' ? totalAmount : 0,
        dueAmount: snfOrder.paymentStatus === 'PAID' ? 0 : totalAmount,
        paymentStatus: snfOrder.paymentStatus,
        paymentMode: snfOrder.paymentMode,
        paymentDate: snfOrder.paymentDate,
        paymentReferenceNo: snfOrder.paymentRefNo
      }
    };

    // Generate PDF
    const pdfFileName = `SNF_${invoiceNo}.pdf`;
    const pdfPath = path.join(__dirname, '..', 'invoices', 'snf', pdfFileName);
    
    // Ensure SNF invoices directory exists
    const invoicesDir = path.join(__dirname, '..', 'invoices', 'snf');
    await fs.mkdir(invoicesDir, { recursive: true });

    await generateInvoicePdf(invoiceData, pdfPath);

    return {
      invoiceNo,
      pdfPath: path.join('snf', pdfFileName), // Relative path for storage
      fullPath: pdfPath
    };
  } catch (error) {
    console.error('Error generating SNF invoice:', error);
    throw error;
  }
};

/**
 * Generate invoice line items from SNF order items
 * @param {Object} snfOrder - The SNF order with items
 * @returns {Array} Array of invoice line items
 */
const generateInvoiceItemsFromSNFOrder = (snfOrder) => {
  const items = [];
  let srNo = 1;

  if (!snfOrder.items || snfOrder.items.length === 0) {
    throw new Error('No items found in SNF order');
  }

  for (const item of snfOrder.items) {
    const description = [
      item.name,
      item.variantName ? `Variant: ${item.variantName}` : '',
      `Quantity: ${item.quantity}`,
      `Rate: ₹${item.price.toFixed(2)} per unit`
    ].filter(Boolean).join('\n');
    
    items.push({
      srNo: srNo++,
      description,
      hsnSac: '', // SNF orders typically don't have HSN codes
      quantity: item.quantity,
      rate: item.price,
      unit: 'Unit',
      amount: item.lineTotal
    });
  }

  // Add delivery fee as separate line item if applicable
  if (snfOrder.deliveryFee > 0) {
    items.push({
      srNo: srNo++,
      description: 'Delivery Charges',
      hsnSac: '',
      quantity: 1,
      rate: snfOrder.deliveryFee,
      unit: 'Service',
      amount: snfOrder.deliveryFee
    });
  }

  return items;
};

/**
 * Update SNF order with invoice details
 * @param {number} orderId - SNF order ID
 * @param {string} invoiceNo - Generated invoice number
 * @param {string} invoicePath - Path to generated invoice PDF
 * @returns {Promise<Object>} Updated SNF order
 */
const updateSNFOrderWithInvoice = async (orderId, invoiceNo, invoicePath) => {
  try {
    const updatedOrder = await prisma.sNFOrder.update({
      where: { id: orderId },
      data: {
        invoiceNo,
        invoicePath
      },
      include: {
        items: true,
        member: true,
        depot: true
      }
    });

    return updatedOrder;
  } catch (error) {
    console.error('Error updating SNF order with invoice details:', error);
    throw error;
  }
};

/**
 * Generate and attach invoice to SNF order
 * @param {number} orderId - SNF order ID
 * @returns {Promise<Object>} Updated order with invoice details
 */
const generateAndAttachInvoiceToSNFOrder = async (orderId) => {
  try {
    // Get SNF order with all required relations
    const snfOrder = await prisma.sNFOrder.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        member: {
          include: {
            user: true
          }
        },
        depot: true
      }
    });

    if (!snfOrder) {
      throw new Error('SNF order not found');
    }

    // Generate invoice
    const { invoiceNo, pdfPath } = await generateInvoiceForSNFOrder(snfOrder);

    // Update order with invoice details
    const updatedOrder = await updateSNFOrderWithInvoice(orderId, invoiceNo, pdfPath);

    return {
      success: true,
      order: updatedOrder,
      invoice: {
        invoiceNo,
        pdfPath
      }
    };
  } catch (error) {
    console.error('Error generating and attaching invoice to SNF order:', error);
    throw error;
  }
};

module.exports = {
  generateInvoiceForSNFOrder,
  generateInvoiceItemsFromSNFOrder,
  updateSNFOrderWithInvoice,
  generateAndAttachInvoiceToSNFOrder
};
