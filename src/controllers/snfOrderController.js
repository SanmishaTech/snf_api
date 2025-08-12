const asyncHandler = require('express-async-handler');
const prisma = require('../config/db');

// Utility to generate unique order number in FY format: e.g., 2526-00001
async function generateOrderNo() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  const fyStartYear = month >= 4 ? year : year - 1; // FY starts in April
  const fyEndYear = fyStartYear + 1;
  const fyPrefix = `${String(fyStartYear).slice(-2)}${String(fyEndYear).slice(-2)}`; // e.g., "2526"

  // Use transaction to prevent race conditions
  const result = await prisma.$transaction(async (tx) => {
    // Find the latest order for this FY prefix and increment
    const latest = await tx.sNFOrder.findFirst({
      where: { orderNo: { startsWith: `${fyPrefix}-` } },
      orderBy: { orderNo: 'desc' }, // Order by orderNo instead of id for better sequence
      select: { orderNo: true },
    });

    let nextSeq = 1;
    if (latest?.orderNo) {
      const m = latest.orderNo.match(/-(\d+)$/);
      if (m) nextSeq = parseInt(m[1], 10) + 1;
    }

    const orderNo = `${fyPrefix}-${String(nextSeq).padStart(5, '0')}`;
    return orderNo;
  });

  return result;
}

/**
 * @desc    Create a SNF order from checkout (public)
 * @route   POST /api/snf-orders
 * @access  Public
 */
const createSNFOrder = asyncHandler(async (req, res) => {
  const {
    customer = {},
    items = [],
    subtotal,
    deliveryFee = 0,
    totalAmount,
    walletamt = 0,
    payableAmount = 0,
    paymentMode = null,
    paymentRefNo = null,
    paymentStatus = 'PENDING',
    paymentDate = null,
    depotId = null, // Optional depot association
  } = req.body || {};

  // Basic validations
  if (!customer || typeof customer !== 'object') {
    res.status(400);
    throw new Error('Customer info is required');
  }
  const { name, email = null, mobile, addressLine1, addressLine2 = null, city, state = null, pincode } = customer;
  if (!name || !mobile || !addressLine1 || !city || !pincode) {
    res.status(400);
    throw new Error('Missing required customer fields: name, mobile, addressLine1, city, pincode');
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('At least one cart item is required');
  }
  if (typeof subtotal !== 'number' || typeof totalAmount !== 'number') {
    res.status(400);
    throw new Error('Invalid amounts: subtotal and totalAmount must be numbers');
  }

  // Handle depot assignment
  let finalDepotId = depotId;
  
  // Convert string ID to integer if provided
  if (finalDepotId && typeof finalDepotId === 'string') {
    finalDepotId = parseInt(finalDepotId, 10);
    if (isNaN(finalDepotId)) {
      console.warn('[SNF Order] Invalid depot ID provided, ignoring:', depotId);
      finalDepotId = null;
    }
  }
  
  // If no depot provided, use the default online depot for SNF orders
  if (!finalDepotId) {
    const onlineDepot = await prisma.depot.findFirst({
      where: { isOnline: true },
      select: { id: true }
    });
    if (onlineDepot) {
      finalDepotId = onlineDepot.id;
      console.log(`[SNF Order] Using default online depot ID: ${finalDepotId}`);
    }
  }
  
  // Validate depot if specified
  if (finalDepotId) {
    const depot = await prisma.depot.findUnique({ where: { id: finalDepotId } });
    if (!depot) {
      res.status(400);
      throw new Error('Invalid depot specified');
    }
    console.log(`[SNF Order] Validated depot: ${depot.name} (ID: ${finalDepotId})`);
  }

  // Validate items and compute totals
  let computedSubtotal = 0;
  const preparedItems = items.map((it, idx) => {
    const { name, variantName = null, imageUrl = null, price, quantity, productId = null, depotProductVariantId = null } = it || {};
    if (!name || typeof price !== 'number' || typeof quantity !== 'number') {
      throw new Error(`Invalid item at index ${idx}`);
    }
    const lineTotal = price * quantity;
    computedSubtotal += lineTotal;
    return {
      name,
      variantName,
      imageUrl,
      price,
      quantity,
      lineTotal,
      productId,
      depotProductVariantId,
    };
  });

  // Allow small rounding diff (<= 1)
  if (Math.abs(computedSubtotal - subtotal) > 1) {
    res.status(400);
    throw new Error('Subtotal mismatch');
  }
  const computedTotal = parseFloat((computedSubtotal + (deliveryFee || 0)).toFixed(2));
  if (Math.abs(computedTotal - totalAmount) > 1) {
    res.status(400);
    throw new Error('Total amount mismatch');
  }

  const orderNo = await generateOrderNo();

  // Attach memberId if available (authenticated request)
  console.log('[SNF Order] User from req:', req.user ? `ID: ${req.user.id}, Role: ${req.user.role}, Member: ${JSON.stringify(req.user.member)}` : 'No user authenticated');
  const memberId = req.user?.role === 'MEMBER' && req.user?.member?.id ? req.user.member.id : null;
  console.log('[SNF Order] Final memberId:', memberId);
  console.log('[SNF Order] Final depotId:', finalDepotId);

  // Handle wallet deduction if walletamt > 0 and user is authenticated
  if (walletamt > 0 && memberId) {
    console.log(`[SNF Order] Wallet deduction requested: ${walletamt} for member ${memberId}`);
    
    // Check if member has sufficient wallet balance
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { walletBalance: true }
    });
    
    if (!member) {
      res.status(400);
      throw new Error('Member not found for wallet deduction');
    }
    
    if (member.walletBalance < walletamt) {
      res.status(400);
      throw new Error(`Insufficient wallet balance. Available: ₹${member.walletBalance}, Required: ₹${walletamt}`);
    }
  }

  try {
    // Calculate the actual payable amount (backend should be source of truth)
    const actualWalletDeduction = walletamt || 0;
    const actualPayableAmount = Math.max(0, computedTotal - actualWalletDeduction);
    
    console.log(`[SNF Order] Computed amounts - Total: ${computedTotal}, Wallet: ${actualWalletDeduction}, Payable: ${actualPayableAmount}`);
    
    // Use transaction to ensure atomicity of order creation and wallet deduction
    const created = await prisma.$transaction(async (tx) => {
      // Create the SNF order
      const order = await tx.sNFOrder.create({
      data: {
        orderNo,
        memberId,
        depotId: finalDepotId,
        name,
        email,
        mobile,
        addressLine1,
        addressLine2,
        city,
        state,
        pincode,
        subtotal: computedSubtotal,
        deliveryFee: deliveryFee || 0,
        totalAmount: computedTotal,
        walletamt: actualWalletDeduction,
        payableAmount: actualPayableAmount,
        paymentMode,
        paymentStatus,
        paymentRefNo,
        paymentDate: paymentDate ? new Date(paymentDate) : null,
        items: {
          create: preparedItems,
        },
      },
      include: {
        items: true,
        depot: true,
      },
    });
    
    // Handle wallet deduction if applicable
    if (walletamt > 0 && memberId) {
      console.log(`[SNF Order] Processing wallet deduction of ₹${walletamt} for member ${memberId}`);
      
      // Deduct from member's wallet balance
      await tx.member.update({
        where: { id: memberId },
        data: {
          walletBalance: {
            decrement: walletamt
          }
        }
      });
      
      // Create wallet transaction record
      await tx.walletTransaction.create({
        data: {
          memberId: memberId,
          amount: walletamt,
          type: 'DEBIT',
          status: 'PAID',
          paymentMethod: 'WALLET',
          notes: `Wallet deduction for SNF Order ${order.orderNo}`,
          referenceNumber: order.orderNo
        }
      });
      
      console.log(`[SNF Order] Wallet deduction completed successfully`);
    }
    
    return order;
    });

    // Auto-generate invoice for the order
    let invoiceGenerated = false;
    let invoiceDetails = null;
    try {
      const { generateAndAttachInvoiceToSNFOrder } = require('../services/snfInvoiceService');
      const invoiceResult = await generateAndAttachInvoiceToSNFOrder(created.id);
      invoiceGenerated = true;
      invoiceDetails = {
        invoiceNo: invoiceResult.invoice.invoiceNo,
        invoicePath: invoiceResult.invoice.pdfPath,
      };
    } catch (invoiceError) {
      console.error('Failed to auto-generate invoice for SNF order:', invoiceError);
      // Don't fail the order creation if invoice generation fails
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        id: created.id,
        orderNo: created.orderNo,
        totalAmount: created.totalAmount,
        paymentStatus: created.paymentStatus,
        depot: created.depot,
        createdAt: created.createdAt,
      },
    });
  } catch (err) {
    console.error('SNF order create error:', err);
    res.status(500);
    throw new Error(err?.message || 'Failed to create order');
  }
});

/**
 * @desc    Get order by orderNo (public minimal tracking)
 * @route   GET /api/snf-orders/:orderNo
 * @access  Public
 */
const getSNFOrderByOrderNo = asyncHandler(async (req, res) => {
  const { orderNo } = req.params;
  if (!orderNo) {
    res.status(400);
    throw new Error('orderNo is required');
  }
  const order = await prisma.sNFOrder.findUnique({
    where: { orderNo },
    include: { items: true },
  });
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  res.status(200).json({ success: true, data: order });
});

module.exports = {
  createSNFOrder,
  getSNFOrderByOrderNo,
};
