const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db');
const { generateAndAttachInvoiceToSNFOrder } = require('../../services/snfInvoiceService');
const path = require('path');

/**
 * @desc    List SNF orders with pagination, search and sorting
 * @route   GET /api/admin/snf-orders
 * @access  Private/Admin
 */
const getAllSNFOrders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';

  const where = search
    ? {
        OR: [
          { orderNo: { contains: search } },
          { name: { contains: search } },
          { mobile: { contains: search } },
          { email: { contains: search } },
          { city: { contains: search } },
        ],
      }
    : {};

  const totalRecords = await prisma.sNFOrder.count({ where });
  const totalPages = Math.ceil(totalRecords / limit);

  const orders = await prisma.sNFOrder.findMany({
    where,
    skip,
    take: limit,
    orderBy: { [sortBy]: sortOrder },
    select: {
      id: true,
      orderNo: true,
      name: true,
      mobile: true,
      email: true,
      city: true,
      subtotal: true,
      deliveryFee: true,
      totalAmount: true,
      walletamt: true,
      payableAmount: true,
      paymentMode: true,
      paymentStatus: true,
      invoiceNo: true,
      invoicePath: true,
      createdAt: true,
      depot: {
        select: {
          id: true,
          name: true,
        }
      },
      _count: { select: { items: true } },
    },
  });

  res.status(200).json({
    orders,
    currentPage: page,
    totalPages,
    totalRecords,
  });
});

/**
 * @desc    Get SNF order by ID with items
 * @route   GET /api/admin/snf-orders/:id
 * @access  Private/Admin
 */
const getSNFOrderById = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400);
    throw new Error('Invalid id');
  }

  const order = await prisma.sNFOrder.findUnique({
    where: { id },
    include: { 
      items: true, 
      member: true, 
      depot: true 
    },
  });

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  res.status(200).json(order);
});

/**
 * @desc    Mark an SNF order as PAID with optional payment details
 * @route   PATCH /api/admin/snf-orders/:id/mark-paid
 * @access  Private/Admin
 */
const markSNFOrderAsPaid = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400);
    throw new Error('Invalid id');
  }

  // Ensure order exists
  const existing = await prisma.sNFOrder.findUnique({ where: { id } });
  if (!existing) {
    res.status(404);
    throw new Error('Order not found');
  }

  const { paymentMode = null, paymentRefNo = null, paymentDate = null } = req.body || {};
  const updateData = {
    paymentStatus: 'PAID',
    paymentMode,
    paymentRefNo,
    paymentDate: paymentDate ? new Date(paymentDate) : null,
  };

  const updated = await prisma.sNFOrder.update({
    where: { id },
    data: updateData,
    include: { items: true, member: true, depot: true },
  });

  res.status(200).json(updated);
});

/**
 * @desc    Partially update SNF order (admin)
 *          Allowed fields: paymentStatus, paymentMode, paymentRefNo, paymentDate
 * @route   PATCH /api/admin/snf-orders/:id
 * @access  Private/Admin
 */
const updateSNFOrder = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400);
    throw new Error('Invalid id');
  }

  // Ensure order exists
  const existing = await prisma.sNFOrder.findUnique({ where: { id } });
  if (!existing) {
    res.status(404);
    throw new Error('Order not found');
  }

  const allowedFields = ['paymentStatus', 'paymentMode', 'paymentRefNo', 'paymentDate'];
  const data = {};
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      if (key === 'paymentDate' && req.body[key]) {
        data[key] = new Date(req.body[key]);
      } else {
        data[key] = req.body[key];
      }
    }
  }

  if (Object.keys(data).length === 0) {
    res.status(400);
    throw new Error('No valid fields to update');
  }

  const updated = await prisma.sNFOrder.update({
    where: { id },
    data,
    include: { items: true, member: true },
  });

  res.status(200).json(updated);
});

/**
 * @desc    Generate invoice for SNF order
 * @route   POST /api/admin/snf-orders/:id/generate-invoice
 * @access  Private/Admin
 */
const generateSNFOrderInvoice = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400);
    throw new Error('Invalid id');
  }

  try {
    const result = await generateAndAttachInvoiceToSNFOrder(id);
    
    res.status(200).json({
      success: true,
      message: 'Invoice generated successfully',
      data: {
        invoiceNo: result.invoice.invoiceNo,
        invoicePath: result.invoice.pdfPath,
        order: result.order
      }
    });
  } catch (error) {
    console.error('Error generating SNF order invoice:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to generate invoice');
  }
});

/**
 * @desc    Download invoice for SNF order
 * @route   GET /api/admin/snf-orders/:id/download-invoice
 * @access  Private/Admin
 */
const downloadSNFOrderInvoice = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400);
    throw new Error('Invalid id');
  }

  // Get order with invoice details
  const order = await prisma.sNFOrder.findUnique({
    where: { id },
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
    throw new Error('Invoice not generated for this order. Please generate invoice first.');
  }

  // Construct full path to invoice
  const invoicesDir = path.join(__dirname, '..', '..', 'invoices');
  const fullPath = path.join(invoicesDir, order.invoicePath);

  try {
    // Check if file exists
    const fs = require('fs').promises;
    await fs.access(fullPath);

    // Set response headers for PDF download
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
  getAllSNFOrders,
  getSNFOrderById,
  markSNFOrderAsPaid,
  updateSNFOrder,
  generateSNFOrderInvoice,
  downloadSNFOrderInvoice,
};
