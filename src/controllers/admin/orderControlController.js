const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db');
const { generateAndAttachInvoiceToSNFOrder } = require('../../services/snfInvoiceService');
const {
  buildDetailedDocDefinition,
  buildSummaryDocDefinition,
  createPdfStream,
} = require('../../utils/orderControlPdfGenerator');

/**
 * @desc    Get SNF orders by delivery date with items
 * @route   GET /api/admin/order-control/orders-by-date
 * @access  Private/Admin
 */
const getOrdersByDeliveryDate = asyncHandler(async (req, res) => {
  const { date } = req.query;
  
  if (!date) {
    res.status(400);
    throw new Error('Date parameter is required');
  }

  // Validate date format
  const deliveryDate = new Date(date);
  if (isNaN(deliveryDate.getTime())) {
    res.status(400);
    throw new Error('Invalid date format. Please use YYYY-MM-DD format.');
  }

  // Set time to start and end of day for proper filtering
  const startOfDay = new Date(deliveryDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  
  const endOfDay = new Date(deliveryDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Check if user is DepotAdmin and get depot filter
  const currentUser = req.user;
  const userRole = currentUser?.role?.toUpperCase();
  const isDepotAdmin = userRole === 'DEPOTADMIN' || userRole === 'DEPOT_ADMIN' || userRole?.includes('DEPOT');
  
  console.log(`[OrderControl] User role: ${userRole}, isDepotAdmin: ${isDepotAdmin}, depotId: ${currentUser?.depotId}`);

  try {
    let orders;
    
    // Build base date filter
    const dateFilter = {
      OR: [
        // Orders with explicit delivery date
        {
          deliveryDate: {
            gte: startOfDay,
            lte: endOfDay,
          }
        },
        // Orders created on this date (fallback for orders without specific delivery date)
        {
          AND: [
            { deliveryDate: null },
            {
              createdAt: {
                gte: startOfDay,
                lte: endOfDay,
              }
            }
          ]
        }
      ]
    };
    
    // Add depot filter for DepotAdmin users
    const whereClause = isDepotAdmin && currentUser?.depotId 
      ? { AND: [dateFilter, { depotId: currentUser.depotId }] }
      : dateFilter;
    
    console.log(`[OrderControl] Where clause:`, JSON.stringify(whereClause, null, 2));
    
    try {
      orders = await prisma.sNFOrder.findMany({
        where: whereClause,
        include: {
          items: {
            orderBy: {
              id: 'asc'
            }
          },
          depot: {
            select: {
              id: true,
              name: true,
            }
          },
          member: {
            select: {
              id: true,
              name: true,
            }
          }
        },
        orderBy: {
          orderNo: 'asc'
        }
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown argument `deliveryDate`')) {
        console.warn('[OrderControl] SNFOrder.deliveryDate not found in Prisma model. Falling back to createdAt window filtering.');
        
        // Fallback filter with depot restriction for DepotAdmin
        const fallbackFilter = {
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          }
        };
        
        const fallbackWhere = isDepotAdmin && currentUser?.depotId 
          ? { AND: [fallbackFilter, { depotId: currentUser.depotId }] }
          : fallbackFilter;
        
        orders = await prisma.sNFOrder.findMany({
          where: fallbackWhere,
          include: {
            items: {
              orderBy: { id: 'asc' }
            },
            depot: { select: { id: true, name: true } },
            member: { select: { id: true, name: true } },
          },
          orderBy: { orderNo: 'asc' }
        });
      } else {
        throw e;
      }
    }

    res.status(200).json({
      orders,
      totalOrders: orders.length,
      date: date,
    });

  } catch (error) {
    console.error('Error fetching orders by delivery date:', error);
    res.status(500);
    throw new Error('Failed to fetch orders for the specified date');
  }
});

/**
 * @desc    Update quantity of an SNF order item
 * @route   PATCH /api/admin/order-control/update-item-quantity
 * @access  Private/Admin
 */
const updateItemQuantity = asyncHandler(async (req, res) => {
  const { orderId, itemId, quantity } = req.body;

  // Validation
  if (!orderId || !itemId || quantity === undefined) {
    res.status(400);
    throw new Error('orderId, itemId, and quantity are required');
  }

  if (quantity < 0) {
    res.status(400);
    throw new Error('Quantity cannot be negative');
  }

  try {
    // Check if order exists
    const order = await prisma.sNFOrder.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // Check if item exists and belongs to this order
    const item = order.items.find(i => i.id === itemId);
    if (!item) {
      res.status(404);
      throw new Error('Order item not found');
    }

    // Business rule: Quantity can only be reduced from the current quantity
    if (quantity > item.quantity) {
      res.status(400);
      throw new Error('Quantity cannot exceed the current ordered quantity');
    }

    // Do not allow editing quantity of cancelled items
    if (item.isCancelled) {
      res.status(400);
      throw new Error('Cannot edit quantity of a cancelled item');
    }

    // Update the item quantity and line total
    const newLineTotal = quantity * item.price;
    
    await prisma.sNFOrderItem.update({
      where: { id: itemId },
      data: {
        quantity: quantity,
        lineTotal: newLineTotal,
        updatedAt: new Date(),
      }
    });

    // Recalculate order totals
    const updatedOrder = await prisma.sNFOrder.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    // Calculate new subtotal based on active (non-cancelled) items
    const newSubtotal = updatedOrder.items
      .filter(item => !item.isCancelled)
      .reduce((sum, item) => sum + item.lineTotal, 0);
    
    const newTotalAmount = newSubtotal + (updatedOrder.deliveryFee || 0);

    // Update order totals
    await prisma.sNFOrder.update({
      where: { id: orderId },
      data: {
        subtotal: newSubtotal,
        totalAmount: newTotalAmount,
        updatedAt: new Date(),
      }
    });

    // Check if invoice needs regeneration (if order is paid and has invoice)
    const needsInvoiceRegeneration = order.paymentStatus === 'PAID' && 
                                   order.invoiceNo && 
                                   order.invoicePath;

    res.status(200).json({
      success: true,
      message: 'Item quantity updated successfully',
      newOrderTotal: newTotalAmount,
      needsInvoiceRegeneration,
      updatedItem: {
        id: itemId,
        quantity: quantity,
        lineTotal: newLineTotal,
      }
    });

  } catch (error) {
    console.error('Error updating item quantity:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to update item quantity');
  }
});

/**
 * @desc    Toggle cancellation status of an SNF order item
 * @route   PATCH /api/admin/order-control/toggle-item-cancellation
 * @access  Private/Admin
 */
const toggleItemCancellation = asyncHandler(async (req, res) => {
  const { orderId, itemId, isCancelled } = req.body;

  // Validation
  if (!orderId || !itemId || typeof isCancelled !== 'boolean') {
    res.status(400);
    throw new Error('orderId, itemId, and isCancelled (boolean) are required');
  }

  try {
    // Check if order exists
    const order = await prisma.sNFOrder.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // Check if item exists and belongs to this order
    const item = order.items.find(i => i.id === itemId);
    if (!item) {
      res.status(404);
      throw new Error('Order item not found');
    }

    // Update the item cancellation status
    console.log(`[Order Control] Updating item ${itemId} cancellation to:`, isCancelled);
    await prisma.sNFOrderItem.update({
      where: { id: itemId },
      data: {
        isCancelled: isCancelled,
        updatedAt: new Date(),
      }
    });
    console.log(`[Order Control] Successfully updated item ${itemId} isCancelled to:`, isCancelled);

    // Recalculate order totals
    const updatedOrder = await prisma.sNFOrder.findUnique({
      where: { id: orderId },
      include: { items: true }
    });

    // Calculate new subtotal based on active (non-cancelled) items
    const newSubtotal = updatedOrder.items
      .filter(item => !item.isCancelled)
      .reduce((sum, item) => sum + item.lineTotal, 0);
    
    const newTotalAmount = newSubtotal + (updatedOrder.deliveryFee || 0);
    
    // Recalculate payable amount: total - wallet deduction
    const newPayableAmount = Math.max(0, newTotalAmount - (updatedOrder.walletamt || 0));
    
    console.log(`[Order Control] Recalculated amounts - Subtotal: ${newSubtotal}, Total: ${newTotalAmount}, Payable: ${newPayableAmount}`);

    // Update order totals including payable amount
    await prisma.sNFOrder.update({
      where: { id: orderId },
      data: {
        subtotal: newSubtotal,
        totalAmount: newTotalAmount,
        payableAmount: newPayableAmount,
        updatedAt: new Date(),
      }
    });

    // Check if invoice needs regeneration (if order is paid and has invoice)
    const needsInvoiceRegeneration = order.paymentStatus === 'PAID' && 
                                   order.invoiceNo && 
                                   order.invoicePath;

    res.status(200).json({
      success: true,
      message: `Item ${isCancelled ? 'cancelled' : 'restored'} successfully`,
      newOrderTotal: newTotalAmount,
      needsInvoiceRegeneration,
      updatedItem: {
        id: itemId,
        isCancelled: isCancelled,
      }
    });

  } catch (error) {
    console.error('Error toggling item cancellation:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to update item cancellation status');
  }
});

/**
 * @desc    Get order statistics for a specific delivery date
 * @route   GET /api/admin/order-control/date-statistics
 * @access  Private/Admin
 */
const getDateStatistics = asyncHandler(async (req, res) => {
  const { date } = req.query;
  
  if (!date) {
    res.status(400);
    throw new Error('Date parameter is required');
  }

  // Validate date format
  const deliveryDate = new Date(date);
  if (isNaN(deliveryDate.getTime())) {
    res.status(400);
    throw new Error('Invalid date format. Please use YYYY-MM-DD format.');
  }

  // Set time to start and end of day for proper filtering
  const startOfDay = new Date(deliveryDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  
  const endOfDay = new Date(deliveryDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  try {
    // Get orders with items for the date
    let orders;
    try {
      orders = await prisma.sNFOrder.findMany({
        where: {
          OR: [
            {
              deliveryDate: {
                gte: startOfDay,
                lte: endOfDay,
              }
            },
            {
              AND: [
                { deliveryDate: null },
                {
                  createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                  }
                }
              ]
            }
          ]
        },
        include: {
          items: true
        }
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown argument `deliveryDate`')) {
        console.warn('[OrderControl] SNFOrder.deliveryDate not found in Prisma model. Falling back to createdAt window filtering (stats).');
        orders = await prisma.sNFOrder.findMany({
          where: {
            createdAt: {
              gte: startOfDay,
              lte: endOfDay,
            }
          },
          include: { items: true }
        });
      } else {
        throw e;
      }
    }

    // Calculate statistics
    let totalOrders = orders.length;
    let totalItems = 0;
    let activeItems = 0;
    let cancelledItems = 0;
    let totalAmount = 0;
    let activeAmount = 0;
    let cancelledAmount = 0;

    orders.forEach(order => {
      order.items.forEach(item => {
        totalItems++;
        if (item.isCancelled) {
          cancelledItems++;
          cancelledAmount += item.lineTotal;
        } else {
          activeItems++;
          activeAmount += item.lineTotal;
        }
        totalAmount += item.lineTotal;
      });
    });

    res.status(200).json({
      date,
      statistics: {
        totalOrders,
        totalItems,
        activeItems,
        cancelledItems,
        totalAmount: totalAmount.toFixed(2),
        activeAmount: activeAmount.toFixed(2),
        cancelledAmount: cancelledAmount.toFixed(2),
        cancellationRate: totalItems > 0 ? ((cancelledItems / totalItems) * 100).toFixed(2) : 0,
      }
    });

  } catch (error) {
    console.error('Error fetching date statistics:', error);
    res.status(500);
    throw new Error('Failed to fetch statistics for the specified date');
  }
});

/**
 * @desc    Download detailed Order Control PDF for a date (Product > Orders)
 * @route   GET /api/admin/order-control/download-detailed-pdf?date=YYYY-MM-DD
 * @access  Private/Admin
 */
const downloadOrderControlDetailedPdf = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) {
    res.status(400);
    throw new Error('Date parameter is required');
  }

  const deliveryDate = new Date(date);
  if (isNaN(deliveryDate.getTime())) {
    res.status(400);
    throw new Error('Invalid date format. Please use YYYY-MM-DD format.');
  }

  const startOfDay = new Date(deliveryDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(deliveryDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Check if user is DepotAdmin and get depot filter
  const currentUser = req.user;
  const userRole = currentUser?.role?.toUpperCase();
  const isDepotAdmin = userRole === 'DEPOTADMIN' || userRole === 'DEPOT_ADMIN' || userRole?.includes('DEPOT');

  try {
    let orders;
    
    // Build base date filter
    const dateFilter = {
      OR: [
        { deliveryDate: { gte: startOfDay, lte: endOfDay } },
        { AND: [ { deliveryDate: null }, { createdAt: { gte: startOfDay, lte: endOfDay } } ] },
      ]
    };
    
    // Add depot filter for DepotAdmin users
    const whereClause = isDepotAdmin && currentUser?.depotId 
      ? { AND: [dateFilter, { depotId: currentUser.depotId }] }
      : dateFilter;
    
    try {
      orders = await prisma.sNFOrder.findMany({
        where: whereClause,
        include: { items: true },
        orderBy: { orderNo: 'asc' }
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown argument `deliveryDate`')) {
        // Fallback filter with depot restriction for DepotAdmin
        const fallbackFilter = { createdAt: { gte: startOfDay, lte: endOfDay } };
        const fallbackWhere = isDepotAdmin && currentUser?.depotId 
          ? { AND: [fallbackFilter, { depotId: currentUser.depotId }] }
          : fallbackFilter;
        
        orders = await prisma.sNFOrder.findMany({
          where: fallbackWhere,
          include: { items: true },
          orderBy: { orderNo: 'asc' }
        });
      } else {
        throw e;
      }
    }

    // Group by product/variant/price
    const groups = {};
    for (const order of orders) {
      for (const item of order.items) {
        const key = `${item.name}-${item.variantName || 'default'}-${item.price}`;
        if (!groups[key]) {
          groups[key] = {
            productName: item.name,
            variantName: item.variantName,
            price: item.price,
            totalQuantity: 0,
            activeQuantity: 0,
            totalAmount: 0,
            activeAmount: 0,
            orders: [],
          };
        }
        groups[key].orders.push({ order, item });
        groups[key].totalQuantity += item.quantity;
        groups[key].totalAmount += item.lineTotal;
        if (!item.isCancelled) {
          groups[key].activeQuantity += item.quantity;
          groups[key].activeAmount += item.lineTotal;
        }
      }
    }
    const productGroups = Object.values(groups);

    const docDefinition = buildDetailedDocDefinition({ date, productGroups });
    const pdfDoc = createPdfStream(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OrderControl_Detailed_${date}.pdf"`);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    console.error('Error generating detailed Order Control PDF:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to generate detailed PDF');
  }
});

/**
 * @desc    Download summary Order Control PDF for a date (Aggregated required qty per product/variant)
 * @route   GET /api/admin/order-control/download-summary-pdf?date=YYYY-MM-DD
 * @access  Private/Admin
 */
const downloadOrderControlSummaryPdf = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) {
    res.status(400);
    throw new Error('Date parameter is required');
  }

  const deliveryDate = new Date(date);
  if (isNaN(deliveryDate.getTime())) {
    res.status(400);
    throw new Error('Invalid date format. Please use YYYY-MM-DD format.');
  }

  const startOfDay = new Date(deliveryDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(deliveryDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Check if user is DepotAdmin and get depot filter
  const currentUser = req.user;
  const userRole = currentUser?.role?.toUpperCase();
  const isDepotAdmin = userRole === 'DEPOTADMIN' || userRole === 'DEPOT_ADMIN' || userRole?.includes('DEPOT');

  try {
    let orders;
    
    // Build base date filter
    const dateFilter = {
      OR: [
        { deliveryDate: { gte: startOfDay, lte: endOfDay } },
        { AND: [ { deliveryDate: null }, { createdAt: { gte: startOfDay, lte: endOfDay } } ] },
      ]
    };
    
    // Add depot filter for DepotAdmin users
    const whereClause = isDepotAdmin && currentUser?.depotId 
      ? { AND: [dateFilter, { depotId: currentUser.depotId }] }
      : dateFilter;
    
    try {
      orders = await prisma.sNFOrder.findMany({
        where: whereClause,
        include: { items: true },
        orderBy: { orderNo: 'asc' }
      });
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown argument `deliveryDate`')) {
        // Fallback filter with depot restriction for DepotAdmin
        const fallbackFilter = { createdAt: { gte: startOfDay, lte: endOfDay } };
        const fallbackWhere = isDepotAdmin && currentUser?.depotId 
          ? { AND: [fallbackFilter, { depotId: currentUser.depotId }] }
          : fallbackFilter;
        
        orders = await prisma.sNFOrder.findMany({
          where: fallbackWhere,
          include: { items: true },
          orderBy: { orderNo: 'asc' }
        });
      } else {
        throw e;
      }
    }

    // Aggregate active (non-cancelled) quantities by product/variant
    const summaryMap = new Map();
    for (const order of orders) {
      for (const item of order.items) {
        if (item.isCancelled) continue; // only required qty
        const key = `${item.name}__${item.variantName || ''}`;
        const current = summaryMap.get(key) || { productName: item.name, variantName: item.variantName || '', quantity: 0 };
        current.quantity += item.quantity;
        summaryMap.set(key, current);
      }
    }
    const summaryRows = Array.from(summaryMap.values()).sort((a, b) => {
      if (a.productName === b.productName) return (a.variantName || '').localeCompare(b.variantName || '');
      return a.productName.localeCompare(b.productName);
    });

    const docDefinition = buildSummaryDocDefinition({ date, summaryRows });
    const pdfDoc = createPdfStream(docDefinition);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OrderControl_Summary_${date}.pdf"`);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (error) {
    console.error('Error generating summary Order Control PDF:', error);
    res.status(500);
    throw new Error(error.message || 'Failed to generate summary PDF');
  }
});

module.exports = {
  getOrdersByDeliveryDate,
  updateItemQuantity,
  toggleItemCancellation,
  getDateStatistics,
  downloadOrderControlDetailedPdf,
  downloadOrderControlSummaryPdf,
};
