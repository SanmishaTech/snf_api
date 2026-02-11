const asyncHandler = require('express-async-handler');
const prisma = require('../config/db');
const path = require('path');
const fs = require('fs').promises;

/**
 * @desc    Get invoice status for SNF order (public)
 * @route   GET /api/snf-orders/:orderNo/invoice-status
 * @access  Public
 */
const getSNFOrderInvoiceStatus = asyncHandler(async (req, res) => {
  const { orderNo } = req.params;
  if (!orderNo) {
    res.status(400);
    throw new Error('orderNo is required');
  }

  const order = await prisma.sNFOrder.findUnique({
    where: { orderNo },
    select: {
      id: true,
      orderNo: true,
      invoiceNo: true,
      invoicePath: true,
      paymentStatus: true,
      totalAmount: true,
      createdAt: true
    }
  });

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const hasInvoice = !!(order.invoiceNo && order.invoicePath);
  let invoiceFileExists = false;

  if (hasInvoice) {
    try {
      const invoicesDir = path.join(__dirname, '..', '..', 'uploads', 'invoices');
      const fullPath = path.join(invoicesDir, order.invoicePath);
      await fs.access(fullPath);
      invoiceFileExists = true;
    } catch (error) {
      // File doesn't exist
      invoiceFileExists = false;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      orderId: order.id,
      orderNo: order.orderNo,
      hasInvoice,
      invoiceNo: order.invoiceNo,
      invoiceAvailableForDownload: hasInvoice && invoiceFileExists,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      orderDate: order.createdAt
    }
  });
});

/**
 * @desc    Download invoice for SNF order by orderNo (public)
 * @route   GET /api/snf-orders/:orderNo/download-invoice
 * @access  Public
 */
const downloadSNFOrderInvoiceByOrderNo = asyncHandler(async (req, res) => {
  const { orderNo } = req.params;
  if (!orderNo) {
    res.status(400);
    throw new Error('orderNo is required');
  }

  // Get order with invoice details
  const order = await prisma.sNFOrder.findUnique({
    where: { orderNo },
    select: {
      id: true,
      orderNo: true,
      invoiceNo: true,
      invoicePath: true
    }
  });

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (!order.invoiceNo || !order.invoicePath) {
    res.status(400);
    throw new Error('Invoice not generated for this order.');
  }

  // Construct full path to invoice
  const invoicesDir = path.join(__dirname, '..', '..', 'uploads', 'invoices');
  const fullPath = path.join(invoicesDir, order.invoicePath);

  try {
    // Check if file exists
    await fs.access(fullPath);

    // Set response headers for PDF download
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${order.invoiceNo}.pdf"`);
    
    // Stream the file
    const fileStream = require('fs').createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(404);
    throw new Error('Invoice file not found');
  }
});

module.exports = {
  getSNFOrderInvoiceStatus,
  downloadSNFOrderInvoiceByOrderNo,
};
