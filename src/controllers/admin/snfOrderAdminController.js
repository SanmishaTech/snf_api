const asyncHandler = require('express-async-handler');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const { logSNFOrderChange, getSNFOrderAuditLogs } = require('../../utils/auditLogger');

const prisma = new PrismaClient();
const { generateAndAttachInvoiceToSNFOrder } = require('../../services/snfInvoiceService');

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
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';

  // Build dynamic where clause
  const whereConditions = [];

  // Search filter
  if (search) {
    whereConditions.push({
      OR: [
        { orderNo: { contains: search } },
        { name: { contains: search } },
        { mobile: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
      ],
    });
  }

  // Date range filters with validation
  if (startDate || endDate) {
    const dateFilter = {};
    
    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        res.status(400);
        throw new Error(`Invalid startDate format: ${startDate}. Please use YYYY-MM-DD format.`);
      }
      start.setUTCHours(0, 0, 0, 0);
      dateFilter.gte = start;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        res.status(400);
        throw new Error(`Invalid endDate format: ${endDate}. Please use YYYY-MM-DD format.`);
      }
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    
    // Validate date range logic
    if (dateFilter.gte && dateFilter.lte && dateFilter.gte > dateFilter.lte) {
      res.status(400);
      throw new Error('startDate cannot be after endDate.');
    }
    
    whereConditions.push({ createdAt: dateFilter });
  }

  const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

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
      deliveryDate: true,
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

  // Log the payment status change
  await logSNFOrderChange({
    orderId: id,
    userId: req.user.id,
    action: 'PAYMENT_STATUS_UPDATED',
    description: `Order marked as PAID with mode: ${paymentMode || 'N/A'}`,
    oldValue: { paymentStatus: existing.paymentStatus },
    newValue: { paymentStatus: 'PAID', paymentMode, paymentRefNo, paymentDate },
  });

  res.status(200).json(updated);
});

/**
 * @desc    Partially update SNF order (admin)
 *          Allowed fields: paymentStatus, paymentMode, paymentRefNo, paymentDate, deliveryDate
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

  const allowedFields = ['paymentStatus', 'paymentMode', 'paymentRefNo', 'paymentDate', 'deliveryDate'];
  const data = {};
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
      if ((key === 'paymentDate' || key === 'deliveryDate') && req.body[key]) {
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

  const updatedOrder = await prisma.sNFOrder.update({
    where: { id },
    data,
    include: { items: true, member: true, depot: true },
  });

  // Log the change
  await logSNFOrderChange({
    orderId: id,
    userId: req.user.id,
    action: 'ORDER_UPDATED',
    description: `Order updated: ${Object.keys(data).join(', ')}`,
    oldValue: {
      paymentStatus: existing.paymentStatus,
      paymentMode: existing.paymentMode,
      paymentRefNo: existing.paymentRefNo,
      paymentDate: existing.paymentDate,
      deliveryDate: existing.deliveryDate
    },
    newValue: data,
  });

  res.status(200).json(updatedOrder);
});

/**
 * @desc    Add a new item to an SNF order
 * @route   POST /api/admin/snf-orders/:id/items
 * @access  Private/Admin
 */
const addSNFOrderItem = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  if (Number.isNaN(orderId)) {
    res.status(400);
    throw new Error('Invalid id');
  }

  const { depotProductVariantId = null, productId = null, price, quantity, imageUrl = null } = req.body || {};

  if (typeof price !== 'number' || typeof quantity !== 'number' || quantity <= 0) {
    res.status(400);
    throw new Error('Valid price and positive quantity are required');
  }

  // Fetch order with depot
  const order = await prisma.sNFOrder.findUnique({ where: { id: orderId }, include: { items: true, depot: true } });
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Attempt to derive product/name details from IDs if available
  let itemName = req.body.name || null;
  let variantName = req.body.variantName || null;
  let resolvedProductId = productId;
  let resolvedDepotVariantId = depotProductVariantId;

  if (depotProductVariantId) {
    const dv = await prisma.depotProductVariant.findUnique({
      where: { id: depotProductVariantId },
      include: { product: true },
    });
    if (!dv) {
      res.status(400);
      throw new Error('Invalid depotProductVariantId');
    }
    itemName = itemName || dv.product.name;
    variantName = variantName || dv.name;
    resolvedProductId = resolvedProductId || dv.productId;
    resolvedDepotVariantId = dv.id;
  } else if (productId) {
    const prod = await prisma.product.findUnique({ where: { id: productId } });
    if (!prod) {
      res.status(400);
      throw new Error('Invalid productId');
    }
    itemName = itemName || prod.name;
  }

  if (!itemName) {
    res.status(400);
    throw new Error('Item name could not be resolved');
  }

  const lineTotal = price * quantity;

  // Create item and update order totals atomically
  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.sNFOrderItem.create({
      data: {
        orderId,
        depotProductVariantId: resolvedDepotVariantId,
        productId: resolvedProductId,
        name: itemName,
        variantName: variantName,
        imageUrl: imageUrl || null,
        price,
        quantity,
        lineTotal,
      },
    });

    const fresh = await tx.sNFOrder.findUnique({ where: { id: orderId }, include: { items: true } });

    const newSubtotal = fresh.items.filter(i => !i.isCancelled).reduce((sum, it) => sum + it.lineTotal, 0);
    const newTotalAmount = newSubtotal + (fresh.deliveryFee || 0);
    const newPayableAmount = Math.max(0, newTotalAmount - (fresh.walletamt || 0));

    const orderUpdated = await tx.sNFOrder.update({
      where: { id: orderId },
      data: {
        subtotal: newSubtotal,
        totalAmount: newTotalAmount,
        payableAmount: newPayableAmount,
        updatedAt: new Date(),
      },
      include: { items: true, depot: true },
    });

    // Stock ledger and variant stock adjustment for positive addition
    if (orderUpdated.depotId && resolvedDepotVariantId && quantity > 0) {
      try {
        await tx.stockLedger.create({
          data: {
            productId: resolvedProductId,
            variantId: resolvedDepotVariantId,
            depotId: orderUpdated.depotId,
            transactionDate: new Date(),
            receivedQty: 0,
            issuedQty: quantity,
            module: 'cart-edit',
            foreignKey: orderUpdated.id,
          },
        });
        await tx.depotProductVariant.update({
          where: { id: resolvedDepotVariantId },
          data: { closingQty: { decrement: quantity } },
        });
      } catch (e) {
        console.warn('[SNF Edit] Stock adjustment failed for add item:', e?.message || e);
      }
    }

    return orderUpdated;
  });

  // Log the item addition
  await logSNFOrderChange({
    orderId,
    userId: req.user.id,
    action: 'ITEM_ADDED',
    description: `Added item: ${itemName}${variantName ? ` (${variantName})` : ''} - Qty: ${quantity} - Price: ₹${price}`,
    oldValue: null,
    newValue: {
      productId: resolvedProductId,
      depotProductVariantId: resolvedDepotVariantId,
      name: itemName,
      variantName,
      price,
      quantity,
      lineTotal,
    },
  });

  res.status(200).json({
    success: true,
    message: 'Item added successfully',
    order: updatedOrder,
    newOrderTotal: updatedOrder.totalAmount,
  });
});

/**
 * @desc    Update quantity for an SNF order item (allows increase/decrease; increase adjusts stock)
 * @route   PATCH /api/admin/snf-orders/:id/items/:itemId
 * @access  Private/Admin
 */
const updateSNFOrderItem = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const itemId = parseInt(req.params.itemId, 10);
  const { quantity } = req.body || {};

  if (Number.isNaN(orderId) || Number.isNaN(itemId)) {
    res.status(400);
    throw new Error('Invalid id');
  }
  if (typeof quantity !== 'number' || quantity < 0) {
    res.status(400);
    throw new Error('Quantity must be a non-negative number');
  }

  const order = await prisma.sNFOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  const item = order.items.find(i => i.id === itemId);
  if (!item) {
    res.status(404);
    throw new Error('Order item not found');
  }
  if (item.isCancelled) {
    res.status(400);
    throw new Error('Cannot edit a cancelled item');
  }

  const delta = quantity - item.quantity;
  const newLineTotal = quantity * item.price;

  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.sNFOrderItem.update({
      where: { id: itemId },
      data: {
        quantity,
        lineTotal: newLineTotal,
        updatedAt: new Date(),
      },
    });

    const fresh = await tx.sNFOrder.findUnique({ where: { id: orderId }, include: { items: true } });

    const newSubtotal = fresh.items.filter(i => !i.isCancelled).reduce((sum, it) => sum + it.lineTotal, 0);
    const newTotalAmount = newSubtotal + (fresh.deliveryFee || 0);
    const newPayableAmount = Math.max(0, newTotalAmount - (fresh.walletamt || 0));

    const orderUpdated = await tx.sNFOrder.update({
      where: { id: orderId },
      data: {
        subtotal: newSubtotal,
        totalAmount: newTotalAmount,
        payableAmount: newPayableAmount,
        updatedAt: new Date(),
      },
      include: { items: true, depot: true },
    });

    // Adjust stock only when increasing quantity (delta > 0)
    if (delta > 0 && orderUpdated.depotId && item.depotProductVariantId) {
      try {
        await tx.stockLedger.create({
          data: {
            productId: item.productId,
            variantId: item.depotProductVariantId,
            depotId: orderUpdated.depotId,
            transactionDate: new Date(),
            receivedQty: 0,
            issuedQty: delta,
            module: 'cart-edit',
            foreignKey: orderUpdated.id,
          },
        });
        await tx.depotProductVariant.update({
          where: { id: item.depotProductVariantId },
          data: { closingQty: { decrement: delta } },
        });
      } catch (e) {
        console.warn('[SNF Edit] Stock adjustment failed for quantity increase:', e?.message || e);
      }
    }

    return orderUpdated;
  });

  // Log the quantity change
  await logSNFOrderChange({
    orderId,
    userId: req.user.id,
    action: 'ITEM_QUANTITY_UPDATED',
    description: `Updated quantity for ${item.name}${item.variantName ? ` (${item.variantName})` : ''}: ${item.quantity} → ${quantity}`,
    oldValue: { itemId, quantity: item.quantity, lineTotal: item.lineTotal },
    newValue: { itemId, quantity, lineTotal: newLineTotal },
  });

  const needsInvoiceRegeneration = order.paymentStatus === 'PAID' && order.invoiceNo && order.invoicePath;
  res.status(200).json({
    success: true,
    message: 'Item quantity updated successfully',
    order: updatedOrder,
    needsInvoiceRegeneration,
  });
});

/**
 * @desc    Toggle cancellation for an SNF order item (specific order)
 * @route   PATCH /api/admin/snf-orders/:id/items/:itemId/cancel
 * @access  Private/Admin
 */
const toggleSNFOrderItemCancellation = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const itemId = parseInt(req.params.itemId, 10);
  const { isCancelled } = req.body || {};

  if (Number.isNaN(orderId) || Number.isNaN(itemId)) {
    res.status(400);
    throw new Error('Invalid id');
  }
  if (typeof isCancelled !== 'boolean') {
    res.status(400);
    throw new Error('isCancelled (boolean) is required');
  }

  // Ensure order and item exist
  const order = await prisma.sNFOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  const item = order.items.find(i => i.id === itemId);
  if (!item) {
    res.status(404);
    throw new Error('Order item not found');
  }

  await prisma.sNFOrderItem.update({
    where: { id: itemId },
    data: { isCancelled, updatedAt: new Date() },
  });

  const updated = await prisma.sNFOrder.findUnique({ where: { id: orderId }, include: { items: true } });
  const newSubtotal = updated.items.filter(i => !i.isCancelled).reduce((sum, it) => sum + it.lineTotal, 0);
  const newTotalAmount = newSubtotal + (updated.deliveryFee || 0);
  const newPayableAmount = Math.max(0, newTotalAmount - (updated.walletamt || 0));

  await prisma.sNFOrder.update({
    where: { id: orderId },
    data: { subtotal: newSubtotal, totalAmount: newTotalAmount, payableAmount: newPayableAmount, updatedAt: new Date() },
  });

  // Log the cancellation/restoration
  await logSNFOrderChange({
    orderId,
    userId: req.user.id,
    action: isCancelled ? 'ITEM_CANCELLED' : 'ITEM_RESTORED',
    description: `${isCancelled ? 'Cancelled' : 'Restored'} item: ${item.name}${item.variantName ? ` (${item.variantName})` : ''}`,
    oldValue: { itemId, isCancelled: item.isCancelled },
    newValue: { itemId, isCancelled },
  });

  const needsInvoiceRegeneration = order.paymentStatus === 'PAID' && order.invoiceNo && order.invoicePath;
  res.status(200).json({
    success: true,
    message: `Item ${isCancelled ? 'cancelled' : 'restored'} successfully`,
    newOrderTotal: newTotalAmount,
    needsInvoiceRegeneration,
  });
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
 * @desc    Download invoice for SNF order (regenerates with current data)
 * @route   GET /api/admin/snf-orders/:id/download-invoice
 * @access  Private/Admin
 */
const downloadSNFOrderInvoice = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400);
    throw new Error('Invalid id');
  }

  try {
    // Always regenerate invoice with current data to include any cancelled items
    console.log(`[SNF Download] Regenerating invoice for order ${id} with current data`);
    const result = await generateAndAttachInvoiceToSNFOrder(id);
    
    // Construct full path to the newly generated invoice
    const invoicesDir = path.join(__dirname, '..', '..', 'invoices');
    const fullPath = path.join(invoicesDir, result.invoice.pdfPath);

    // Check if file exists
    const fs = require('fs').promises;
    await fs.access(fullPath);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${result.invoice.invoiceNo}.pdf"`);
    
    // Stream the file
    const fileStream = require('fs').createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading invoice:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to download invoice');
  }
});

/**
 * @desc    Get audit logs for an SNF order
 * @route   GET /api/admin/snf-orders/:id/audit-logs
 * @access  Private/Admin
 */
const getSNFOrderAuditLogsController = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  if (Number.isNaN(orderId)) {
    res.status(400);
    throw new Error('Invalid order ID');
  }

  const limit = parseInt(req.query.limit, 10) || 50;
  const offset = parseInt(req.query.offset, 10) || 0;

  try {
    const logs = await getSNFOrderAuditLogs(orderId, { limit, offset });
    
    res.status(200).json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    res.status(500);
    throw new Error('Failed to fetch audit logs');
  }
});

module.exports = {
  getAllSNFOrders,
  getSNFOrderById,
  markSNFOrderAsPaid,
  updateSNFOrder,
  generateSNFOrderInvoice,
  downloadSNFOrderInvoice,
  addSNFOrderItem,
  updateSNFOrderItem,
  toggleSNFOrderItemCancellation,
  getSNFOrderAuditLogsController,
};
