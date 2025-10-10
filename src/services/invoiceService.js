const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateInvoicePdf } = require('../utils/invoiceGeneratorEnhanced');
const path = require('path');
const fs = require('fs').promises;
const { numberToWords } = require('../utils/numberToWords');
const { generateInvoiceNumber } = require('../utils/invoiceNumberGenerator');

/**
 * Generates an invoice PDF for a product order
 * @param {Object} productOrder - The product order with all relations loaded
 * @returns {Promise<Object>} Object containing invoice number and file path
 */
const generateInvoiceForOrder = async (productOrder) => {
  try {
    // Generate financial year based invoice number
    const invoiceNo = await generateInvoiceNumber();
    
    // Get member details with address
    const member = await prisma.member.findUnique({
      where: { id: productOrder.memberId },
      include: {
        user: true
      }
    });

    // Get the delivery address from the first subscription (if available)
    let memberAddress = null;
    if (productOrder.subscriptions && productOrder.subscriptions.length > 0) {
      // Use delivery address from the subscription if it exists
      memberAddress = productOrder.subscriptions[0].deliveryAddress;
      console.log('Using delivery address from subscription:', memberAddress ? 'Found' : 'Not found');
    }
    
    // If no delivery address found, try to get member's default address as fallback
    if (!memberAddress) {
      console.log('Delivery address not found, fetching member default address');
      const memberWithDefaultAddress = await prisma.member.findUnique({
        where: { id: productOrder.memberId },
        include: {
          addresses: {
            where: { isDefault: true },
            take: 1
          }
        }
      });
      memberAddress = memberWithDefaultAddress?.addresses[0] || null;
      console.log('Member default address:', memberAddress ? 'Found' : 'Not found');
    }

    if (!member) {
      throw new Error('Member not found');
    }
    
    // Calculate invoice amounts
    const subtotal = productOrder.totalAmount;
    const cgstRate = 0;
    const sgstRate = 0;
    const cgstAmount = 0;
    const sgstAmount = 0;
    const totalAmount = subtotal;
    
    // Calculate payment details
    const walletAmount = productOrder.walletamt || 0;
    const paidAmount = productOrder.receivedamt || 0;
    const dueAmount = totalAmount - walletAmount - paidAmount;

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
      invoiceDate: productOrder.createdAt || new Date(),
      orderNo: productOrder.orderNo,
      qrCodePath: qrCodeExists ? qrCodePath : null,
      member: {
        memberName: memberAddress?.recipientName || member.name,
        mobile: memberAddress?.mobile || member.user?.mobile || '',
        email: member.user?.email || '',
        addressLines: memberAddress ? [
          memberAddress.recipientName || member.name,
          memberAddress.plotBuilding,
          memberAddress.streetArea,
          memberAddress.landmark || ''
        ].filter(Boolean) : ['-'],
        city: memberAddress?.city || '',
        state: memberAddress?.state || '',
        pincode: memberAddress?.pincode || '',
        gstin: member.gstin || null
      },
      SNFlobal: {
        name: 'Sarkhot Natural Farms',
        addressLines: ['B/3 Prabhat Society,','Mukherjee Road, Near CKP Hall,',"Dombivli East", "421202", "Thane", "Maharashtra"],
        city: 'Dombivli East',
        pincode: '421202',
        gstinUin: '27AAHCB7744A1ZT',
        email: 'sarkhotnaturalfarms@gmail.com'
      },
      items: await generateInvoiceItems(productOrder),
      totals: {
        amountBeforeTax: subtotal,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate: 0,
        igstAmount: 0,
        totalAmount,
        amountInWords: numberToWords(totalAmount)
      },
      paymentDetails: {
        walletAmount: walletAmount,
        paidAmount: paidAmount,
        dueAmount: dueAmount,
        paymentStatus: productOrder.paymentStatus,
        paymentMode: productOrder.paymentMode,
        paymentDate: productOrder.paymentDate,
        paymentReferenceNo: productOrder.paymentReferenceNo
      }
    };

    // Generate PDF
    const pdfFileName = `${invoiceNo}.pdf`;
    const pdfPath = path.join(__dirname, '..', '..', 'uploads', 'invoices', pdfFileName);
    
    // Ensure invoices directory exists
    const invoicesDir = path.join(__dirname, '..', '..', 'uploads', 'invoices');
    await fs.mkdir(invoicesDir, { recursive: true });

    await generateInvoicePdf(invoiceData, pdfPath);

    return {
      invoiceNo,
      pdfPath: pdfFileName,
      fullPath: pdfPath
    };
  } catch (error) {
    console.error('Error generating invoice:', error);
    throw error;
  }
};

/**
 * Get the effective expiry date - use last delivery date or fallback to subscription expiry
 * @param {Object} subscription - The subscription with delivery schedule entries
 * @returns {string} The effective expiry date
 */
const getEffectiveExpiryDate = (subscription) => {
  if (subscription.deliveryScheduleEntries && subscription.deliveryScheduleEntries.length > 0) {
    // Sort delivery entries by date and get the last one
    const sortedEntries = subscription.deliveryScheduleEntries
      .slice()
      .sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime());
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    return lastEntry.deliveryDate;
  }
  // Fallback to subscription expiry date
  return subscription.expiryDate;
};

/**
 * Generate invoice line items from product order
 * @param {Object} productOrder - The product order with subscriptions
 * @returns {Promise<Array>} Array of invoice line items
 */
const generateInvoiceItems = async (productOrder) => {
  const items = [];
  let srNo = 1;

  if (!productOrder.subscriptions || productOrder.subscriptions.length === 0) {
    // If no subscriptions loaded, fetch them
    const orderWithSubs = await prisma.productOrder.findUnique({
      where: { id: productOrder.id },
      include: {
        subscriptions: {
          include: {
            product: true,
            depotProductVariant: true,
            deliveryAddress: true,
            deliveryScheduleEntries: {
              orderBy: {
                deliveryDate: 'asc'
              }
            }
          }
        }
      }
    });
    productOrder.subscriptions = orderWithSubs.subscriptions;
  }

  for (const subscription of productOrder.subscriptions) {
    const productName = subscription.depotProductVariant?.name || subscription.product?.name || 'Product';
    const unit = subscription.product?.unit || 'Unit';
    const rate = subscription.rate || 0;
    const hsnCode = subscription.depotProductVariant?.hsnCode || '';
    
    // Create detailed description with all subscription information
    const scheduleType = getScheduleDescription(subscription.deliverySchedule, subscription.weekdays);
    const effectiveExpiryDate = getEffectiveExpiryDate(subscription);
    const dateRange = `${formatDateShort(subscription.startDate)} to ${formatDateShort(effectiveExpiryDate)}`;
    
    // Handle buyonce orders (period = 0) differently
    const periodDescription = subscription.period === 0 ? '1 day delivery' : `${subscription.period} days subscription`;
    
    const description = [
      productName,
      periodDescription,
      `${scheduleType}`,
      `Dates: ${dateRange}`,
      `Rate: ₹${rate.toFixed(2)}/${unit} × ${subscription.totalQty} ${unit}`
    ].join('\n');
    
    items.push({
      srNo: srNo++,
      description,
      hsnSac: hsnCode,
      quantity: subscription.totalQty,
      rate: rate,
      unit: unit,
      amount: subscription.amount
    });
  }

  return items;
};

/**
 * Get human-readable schedule description
 */
const getScheduleDescription = (schedule, weekdays) => {
  switch (schedule) {
    case 'DAILY':
      return 'Daily delivery';
    case 'ALTERNATE_DAYS':
      return 'Alternate day delivery';
    case 'DAY1_DAY2':
      return 'Varying quantity delivery';
    case 'WEEKDAYS':
      if (weekdays) {
        try {
          const days = JSON.parse(weekdays);
          return `Delivery on: ${days.join(', ')}`;
        } catch (e) {
          return 'Selected weekdays';
        }
      }
      return 'Selected weekdays';
    default:
      return 'Custom schedule';
  }
};

/**
 * Format date in short format DD/MM/YY
 */
const formatDateShort = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

/**
 * Get invoice PDF path for a product order
 * @param {string} orderNo - The order number
 * @returns {string} The invoice PDF path
 */
const getInvoicePath = (orderNo) => {
  const invoiceNo = orderNo.replace('ORD', 'INV');
  const pdfFileName = `${invoiceNo}.pdf`;
  return path.join(__dirname, '..', '..', 'uploads', 'invoices', pdfFileName);
};

/**
 * Check if invoice exists for an order
 * @param {string} orderNo - The order number
 * @returns {Promise<boolean>} True if invoice exists
 */
const invoiceExists = async (orderNo) => {
  const invoicePath = getInvoicePath(orderNo);
  try {
    await fs.access(invoicePath);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Get invoice details for a subscription
 * @param {number} subscriptionId - The subscription ID
 * @returns {Promise<Object|null>} Invoice details or null if not found
 */
const getInvoiceBySubscription = async (subscriptionId) => {
  try {
    // Find the subscription with its product order
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        productOrder: {
          select: {
            id: true,
            orderNo: true,
            invoiceNo: true,
            invoicePath: true
          }
        }
      }
    });

    if (!subscription || !subscription.productOrder) {
      return null;
    }

    const order = subscription.productOrder;
    
    // Check if invoice exists
    if (order.invoicePath) {
      const fullPath = path.join(__dirname, '..', '..', 'uploads', 'invoices', order.invoicePath);
      const exists = await invoiceExists(order.orderNo);
      
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        invoiceNo: order.invoiceNo,
        invoicePath: order.invoicePath,
        fullPath: exists ? fullPath : null,
        exists
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting invoice by subscription:', error);
    throw error;
  }
};

// Alias for backward compatibility
const createInvoiceForOrder = generateInvoiceForOrder;

module.exports = {
  generateInvoiceForOrder,
  createInvoiceForOrder,
  getInvoicePath,
  invoiceExists,
  getInvoiceBySubscription
};
