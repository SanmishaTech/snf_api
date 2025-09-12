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
    deliveryDate = null, // Selected delivery date from frontend
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

  // Attach memberId if available
  console.log('[SNF Order] User from req:', req.user ? `ID: ${req.user.id}, Role: ${req.user.role}, Member: ${JSON.stringify(req.user.member)}` : 'No user authenticated');
  let memberId = req.user?.role === 'MEMBER' && req.user?.member?.id ? req.user.member.id : null;
  // If admin/depot-admin is creating on behalf of a member, allow specifying memberId in body
  const requesterRole = (req.user?.role || '').toUpperCase();
  const isAdminRequester = requesterRole === 'ADMIN' || requesterRole === 'DEPOTADMIN' || requesterRole === 'DEPOT_ADMIN' || requesterRole.includes('ADMIN');
  if (isAdminRequester && req.body?.memberId) {
    const candidate = parseInt(req.body.memberId, 10);
    if (!isNaN(candidate)) {
      const memberExists = await prisma.member.findUnique({ where: { id: candidate }, select: { id: true } });
      if (!memberExists) {
        res.status(400);
        throw new Error('Specified memberId does not exist');
      }
      memberId = candidate;
    }
  }
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
    
    // Use transaction to ensure atomicity of order creation, wallet deduction, and stock management
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
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
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
    
    // Handle stock management if depot is assigned
    if (finalDepotId) {
      console.log(`[SNF Order] Processing stock management for depot ${finalDepotId}`);
      
      // Process each order item for stock management
      for (const item of order.items) {
        if (item.depotProductVariantId && item.productId && item.quantity > 0) {
          console.log(`[SNF Order] Processing stock for item: ${item.name} (Product ID: ${item.productId}, Variant ID: ${item.depotProductVariantId}, Qty: ${item.quantity})`);
          
          try {
            // 1. Create stock ledger entry
            await tx.stockLedger.create({
              data: {
                productId: item.productId,
                variantId: item.depotProductVariantId,
                depotId: finalDepotId,
                transactionDate: new Date(),
                receivedQty: 0,
                issuedQty: item.quantity,
                module: 'cart', // Module type for SNF orders
                foreignKey: order.id, // Reference to the SNF order
              },
            });
            console.log(`[SNF Order] Created stock ledger entry for variant ${item.depotProductVariantId}`);
            
            // 2. Update depot variant quantity (reduce stock)
            const currentVariant = await tx.depotProductVariant.findUnique({
              where: { id: item.depotProductVariantId },
              select: { closingQty: true, name: true }
            });
            
            if (!currentVariant) {
              console.warn(`[SNF Order] Depot variant ${item.depotProductVariantId} not found, skipping stock update`);
              continue;
            }
            
            // Check if sufficient stock is available
            if (currentVariant.closingQty < item.quantity) {
              console.warn(`[SNF Order] Insufficient stock for variant ${item.depotProductVariantId} (${currentVariant.name}). Available: ${currentVariant.closingQty}, Required: ${item.quantity}`);
              // Note: We're not throwing an error here as SNF orders might allow backorders
              // But we log it for monitoring purposes
            }
            
            // Update the variant stock quantity
            await tx.depotProductVariant.update({
              where: { id: item.depotProductVariantId },
              data: {
                closingQty: {
                  decrement: item.quantity
                }
              }
            });
            
            console.log(`[SNF Order] Updated stock for variant ${item.depotProductVariantId} (${currentVariant.name}): reduced by ${item.quantity}`);
            
          } catch (stockError) {
            console.error(`[SNF Order] Error processing stock for item ${item.name}:`, stockError);
            // Log the error but don't fail the entire order
            // In production, you might want to send alerts for stock management failures
          }
        } else {
          console.log(`[SNF Order] Skipping stock management for item ${item.name}: missing depotProductVariantId (${item.depotProductVariantId}) or productId (${item.productId}) or zero quantity`);
        }
      }
      
      console.log(`[SNF Order] Stock management processing completed for order ${order.orderNo}`);
    } else {
      console.log(`[SNF Order] No depot assigned, skipping stock management`);
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
