const asyncHandler = require('express-async-handler');
const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

/**
 * @desc    Search members by name or mobile for POS (returns all if no query)
 * @route   GET /api/pos/members/search
 * @access  Private (DepotAdmin, ADMIN)
 */
const searchMembers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const searchTerm = q ? q.trim() : '';
  
  // If no search term or "*", return all members (limited)
  const isGetAll = !searchTerm || searchTerm === '*';
  
  let whereClause = {};
  
  if (!isGetAll && searchTerm.length >= 1) {
    whereClause = {
      OR: [
        { user: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { mobile: { contains: searchTerm } } },
        { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
      ],
    };
  }
  
  // Search in User and Member tables
  const members = await prisma.member.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          mobile: true,
        },
      },
    },
    orderBy: {
      user: {
        name: 'asc',
      },
    },
    take: isGetAll ? 100 : 10, // Return more when getting all
  });

  // Format response
  const formattedMembers = members.map(member => ({
    id: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    mobile: member.user.mobile,
    walletBalance: member.walletBalance,
  }));

  res.status(200).json({
    success: true,
    data: formattedMembers,
    total: formattedMembers.length,
  });
});

/**
 * @desc    Quick register walk-in customer for POS
 * @route   POST /api/pos/members
 * @access  Private (DepotAdmin, ADMIN)
 */
const quickRegisterMember = asyncHandler(async (req, res) => {
  const { name, mobile, email = null } = req.body;

  // Validation
  if (!name || !mobile) {
    res.status(400);
    throw new Error('Name and mobile are required');
  }

  // Check if mobile already exists
  const existingUser = await prisma.user.findUnique({
    where: { mobile },
  });

  if (existingUser) {
    // If user exists but not a member, create member record
    if (existingUser.role !== 'MEMBER') {
      // Check if member record exists
      const existingMember = await prisma.member.findFirst({
        where: { userId: existingUser.id },
      });

      if (existingMember) {
        res.status(200).json({
          success: true,
          message: 'Customer already exists',
          data: {
            id: existingMember.id,
            userId: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            mobile: existingUser.mobile,
            walletBalance: existingMember.walletBalance,
          },
        });
        return;
      }
    } else {
      // User is already a member
      const member = await prisma.member.findFirst({
        where: { userId: existingUser.id },
        include: { user: true },
      });

      res.status(200).json({
        success: true,
        message: 'Customer already exists',
        data: {
          id: member.id,
          userId: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          mobile: existingUser.mobile,
          walletBalance: member.walletBalance,
        },
      });
      return;
    }
  }

  // Create user and member in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Generate a simple password (customer can reset later)
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create user
    const user = await tx.user.create({
      data: {
        name,
        email: email || `${mobile}@temp.com`, // Temporary email
        mobile,
        password: hashedPassword,
        role: 'MEMBER',
        active: true,
      },
    });

    // Create member
    const member = await tx.member.create({
      data: {
        userId: user.id,
        name,
        walletBalance: 0,
      },
    });

    return { user, member };
  });

  res.status(201).json({
    success: true,
    message: 'Customer registered successfully',
    data: {
      id: result.member.id,
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      mobile: result.user.mobile,
      walletBalance: result.member.walletBalance,
    },
  });
});

/**
 * @desc    Get depot products for POS (simplified)
 * @route   GET /api/pos/products
 * @access  Private (DepotAdmin, ADMIN)
 */
const getDepotProducts = asyncHandler(async (req, res) => {
  const { depotId } = req.query;

  if (!depotId) {
    res.status(400);
    throw new Error('Depot ID is required');
  }

  const depotIdInt = parseInt(depotId, 10);
  if (isNaN(depotIdInt)) {
    res.status(400);
    throw new Error('Invalid depot ID');
  }

  // Get products available at this depot
  const products = await prisma.product.findMany({
    where: {
      depotProductVariants: {
        some: {
          depotId: depotIdInt,
          closingQty: { gt: 0 }, // Only products with stock
          isHidden: false,
        },
      },
    },
    include: {
      images: {
        take: 1,
        select: { url: true },
      },
      depotProductVariants: {
        where: {
          depotId: depotIdInt,
          closingQty: { gt: 0 },
          isHidden: false,
        },
        select: {
          id: true,
          name: true,
          mrp: true,
          salesPrice: true,
          closingQty: true,
          buyOncePrice: true,
        },
      },
      category: {
        select: { id: true, name: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Format for POS
  const formattedProducts = products.map(product => ({
    id: product.id,
    name: product.name,
    category: product.category?.name || 'Uncategorized',
    imageUrl: product.images[0]?.url || null,
    variants: product.depotProductVariants.map(variant => ({
      id: variant.id,
      name: variant.name,
      price: variant.salesPrice || variant.buyOncePrice || variant.mrp,
      stock: variant.closingQty,
    })),
  }));

  res.status(200).json({
    success: true,
    data: formattedProducts,
  });
});

/**
 * @desc    Create POS order
 * @route   POST /api/pos/orders
 * @access  Private (DepotAdmin, ADMIN)
 */
const createPosOrder = asyncHandler(async (req, res) => {
  const {
    memberId,
    customer = {},
    items = [],
    subtotal,
    totalAmount,
    walletamt = 0,
    paymentMode,
    paymentRefNo = null,
    depotId,
    payerName = null,
    utrNo = null,
    chequeNo = null,
    bankName = null,
    transactionId = null,
    paymentDetails = null,
  } = req.body;

  // Validation
  if (!memberId) {
    res.status(400);
    throw new Error('Member ID is required');
  }

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error('At least one item is required');
  }

  if (!paymentMode || !['CASH', 'WALLET', 'ONLINE', 'UPI', 'CHEQUE', 'CARD'].includes(paymentMode)) {
    res.status(400);
    throw new Error('Valid payment mode is required (CASH, WALLET, ONLINE, UPI, CHEQUE, CARD)');
  }

  if (!depotId) {
    res.status(400);
    throw new Error('Depot ID is required');
  }

  // Verify member exists
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { user: true },
  });

  if (!member) {
    res.status(404);
    throw new Error('Member not found');
  }

  // Validate depot
  const depot = await prisma.depot.findUnique({
    where: { id: parseInt(depotId, 10) },
  });

  if (!depot) {
    res.status(400);
    throw new Error('Invalid depot');
  }

  // Check wallet balance if paying with wallet
  if (paymentMode === 'WALLET' || walletamt > 0) {
    if (member.walletBalance < walletamt) {
      res.status(400);
      throw new Error(`Insufficient wallet balance. Available: ₹${member.walletBalance}, Required: ₹${walletamt}`);
    }
  }

  // Validate items and compute totals
  let computedSubtotal = 0;
  const preparedItems = [];

  for (const item of items) {
    const { name, variantName, price, quantity, depotProductVariantId } = item;
    let variant = null; // Declare here for scope

    if (!name || typeof price !== 'number' || typeof quantity !== 'number') {
      res.status(400);
      throw new Error('Invalid item data');
    }

    // Verify stock availability
    if (depotProductVariantId) {
      variant = await prisma.depotProductVariant.findUnique({
        where: { id: depotProductVariantId },
      });

      if (!variant || variant.closingQty < quantity) {
        res.status(400);
        throw new Error(`Insufficient stock for ${name}. Available: ${variant?.closingQty || 0}`);
      }
    }

    const lineTotal = price * quantity;
    computedSubtotal += lineTotal;

    preparedItems.push({
      name,
      variantName: variantName || null,
      price,
      quantity,
      lineTotal,
      depotProductVariantId: depotProductVariantId || null,
      productId: variant?.productId || null,
    });
  }

  // Amount validation (allow small rounding diff)
  if (Math.abs(computedSubtotal - subtotal) > 1) {
    res.status(400);
    throw new Error('Subtotal mismatch');
  }

  const computedTotal = computedSubtotal;
  // tax logic if any...

  // Generate order number
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  const fyPrefix = `${String(fyStartYear).slice(-2)}${String(fyEndYear).slice(-2)}`;

  const latest = await prisma.sNFOrder.findFirst({
    where: { orderNo: { startsWith: `${fyPrefix}-` } },
    orderBy: { orderNo: 'desc' },
    select: { orderNo: true },
  });

  let nextSeq = 1;
  if (latest?.orderNo) {
    const m = latest.orderNo.match(/-(\d+)$/);
    if (m) nextSeq = parseInt(m[1], 10) + 1;
  }
  const orderNo = `${fyPrefix}-${String(nextSeq).padStart(5, '0')}`;

  // Determine final payment status
  const finalPaymentStatus = ['WALLET', 'CASH', 'UPI', 'CHEQUE', 'CARD'].includes(paymentMode) ? 'PAID' : 'PENDING';

  // Create order in transaction
  const created = await prisma.$transaction(async (tx) => {
    // Create order
    const order = await tx.sNFOrder.create({
      data: {
        orderNo,
        memberId,
        depotId: parseInt(depotId, 10),
        name: customer.name || member.user.name,
        email: customer.email || member.user.email,
        mobile: customer.mobile || member.user.mobile,
        addressLine1: 'POS Purchase', // Mark as POS order
        addressLine2: null,
        city: depot.city || 'N/A',
        state: null,
        pincode: '000000', // POS orders don't need delivery
        subtotal: computedSubtotal,
        deliveryFee: 0,
        totalAmount: totalAmount,
        walletamt: walletamt,
        payableAmount: Math.max(0, totalAmount - walletamt),
        paymentMode,
        paymentStatus: finalPaymentStatus,
        paymentRefNo,
        paymentDate: new Date(),
        items: {
          create: preparedItems,
        },
      },
      include: {
        items: true,
        depot: true,
      },
    });

    // Create POS Detail with JSON snapshot
    await tx.posDetail.create({
      data: {
        memberId: parseInt(memberId, 10),
        orderId: order.id,
        productDetails: items, // JSON snapshot of the cart items
        paymentMode,
        payerName,
        utrNo,
        chequeNo,
        bankName,
        transactionId,
        amount: totalAmount,
        paymentDetails,
      }
    });

    // Handle wallet deduction
    if (walletamt > 0) {
      await tx.member.update({
        where: { id: memberId },
        data: {
          walletBalance: {
            decrement: walletamt,
          },
        },
      });

      await tx.walletTransaction.create({
        data: {
          memberId,
          amount: walletamt,
          type: 'DEBIT',
          status: 'PAID',
          paymentMethod: 'WALLET',
          notes: `POS Order ${order.orderNo}`,
          referenceNumber: order.orderNo,
        },
      });
    }

    // Update stock quantities
    for (const item of preparedItems) {
      if (item.depotProductVariantId) {
        await tx.depotProductVariant.update({
          where: { id: item.depotProductVariantId },
          data: {
            closingQty: {
              decrement: item.quantity,
            },
          },
        });

        // Create stock ledger entry
        await tx.stockLedger.create({
          data: {
            productId: item.productId,
            variantId: item.depotProductVariantId,
            depotId: parseInt(depotId, 10),
            transactionDate: new Date(),
            issuedQty: item.quantity,
            receivedQty: 0,
            module: 'SNF_ORDER',
            foreignKey: order.id,
          },
        });
      }
    }

    return order;
  });

  res.status(201).json({
    success: true,
    message: 'POS Order created successfully',
    data: {
      id: created.id,
      orderNo: created.orderNo,
      totalAmount: created.totalAmount,
      paymentMode: created.paymentMode,
      paymentStatus: created.paymentStatus,
      items: created.items,
      createdAt: created.createdAt,
    },
  });
});

/**
 * @desc    Get member wallet balance
 * @route   GET /api/pos/members/:id/wallet
 * @access  Private (DepotAdmin, ADMIN)
 */
const getMemberWallet = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const member = await prisma.member.findUnique({
    where: { id: parseInt(id, 10) },
    select: { id: true, walletBalance: true },
  });

  if (!member) {
    res.status(404);
    throw new Error('Member not found');
  }

  res.status(200).json({
    success: true,
    data: {
      balance: member.walletBalance,
    },
  });
});

module.exports = {
  searchMembers,
  quickRegisterMember,
  getDepotProducts,
  createPosOrder,
  getMemberWallet,
};
