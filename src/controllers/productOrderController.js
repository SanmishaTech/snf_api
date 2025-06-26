const asyncHandler = require('express-async-handler');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// @desc    Create a new product order with multiple subscriptions
// @route   POST /api/product-orders/with-subscriptions
// @access  Private
const createOrderWithSubscriptions = asyncHandler(async (req, res) => {
  const { subscriptions, deliveryAddressId, walletamt } = req.body;
  const member = req.user; // Assuming auth middleware provides user context

  if (!member) {
    res.status(401);
    throw new Error('User not authenticated');
  }

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    res.status(400);
    throw new Error('Subscriptions array is required and cannot be empty.');
  }

  if (!deliveryAddressId) {
    res.status(400);
    throw new Error('deliveryAddressId is required.');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find the member record associated with the authenticated user
      const memberRecord = await tx.member.findUnique({
        where: { userId: member.id },
        select: { id: true },
      });

      if (!memberRecord) {
        throw new Error('Member profile not found for the authenticated user.');
      }
      const memberId = memberRecord.id;

      // The incoming `productId` from the frontend is the depotProductVariant ID.
      const depotVariantIds = subscriptions.map(sub => parseInt(sub.productId, 10));
      const depotVariants = await tx.depotProductVariant.findMany({
        where: { id: { in: depotVariantIds } },
        select: { id: true, sellingPrice: true, productId: true },
      });

      const depotVariantMap = new Map(depotVariants.map(v => [v.id, v]));

      let totalAmount = 0;
      let totalQty = 0;
      const processedSubscriptions = [];

      // First loop: Validate, calculate quantities, and prepare subscription data
      for (const sub of subscriptions) {
        const {
          productId,
          period,
          startDate,
          expiryDate,
          deliverySchedule,
          weekdays,
          qty,
          altQty,
        } = sub;

        // Basic validation for required fields
        if (!productId || !period || !startDate || !deliverySchedule || !qty) {
          throw new Error('Missing required fields for one or more subscriptions.');
        }

        const depotVariant = depotVariantMap.get(sub.productId);
        if (!depotVariant || !depotVariant.sellingPrice) {
          throw new Error(`Depot product variant with ID ${sub.productId} not found or is missing a valid rate.`);
        }

        const sellingPrice = Number(depotVariant.sellingPrice);
        const subscriptionQty = parseInt(qty, 10);
        const subscriptionPeriod = parseInt(period, 10);
        const sDate = new Date(startDate);

        let calculatedExpiryDate;
        if (expiryDate) {
          calculatedExpiryDate = new Date(expiryDate);
        } else {
          calculatedExpiryDate = new Date(sDate);
          calculatedExpiryDate.setDate(sDate.getDate() + subscriptionPeriod - 1); // -1 to be inclusive of start date
        }

        // 1. Update the deliverySchedule mapping logic
        let dbDeliverySchedule;
        let logicDeliverySchedule;
        switch (deliverySchedule.trim().toLowerCase()) {
          case 'daily':
            dbDeliverySchedule = 'DAILY';
            logicDeliverySchedule = 'DAILY';
            break;
          case 'day1-day2': // Map 'day1-day2' to 'DAILY' for logic, but store as 'DAY1-DAY2'
            dbDeliverySchedule = 'DAY1_DAY2';
            logicDeliverySchedule = 'DAILY';
            break;
          case 'alternate-days': // Map 'alternate-days' to 'ALTERNATE_DAYS'
            dbDeliverySchedule = 'ALTERNATE_DAYS';
            break;
          case 'select-days':
            dbDeliverySchedule = 'WEEKDAYS';
            logicDeliverySchedule = 'WEEKDAYS';
            break;
          default:
            throw new Error(`Unsupported delivery schedule: ${deliverySchedule}`);
        }

        // 5. Add validation for schedule-specific fields
        if (dbDeliverySchedule === 'WEEKDAYS' && (!weekdays || weekdays.length === 0)) {
          throw new Error('Weekdays are required for WEEKDAYS delivery schedule');
        }
        if (deliverySchedule.trim().toLowerCase() === 'day1-day2' && !altQty) {
          throw new Error('Alternate quantity is required for Day1-Day2 schedule');
        }

        // 2. Add schedule-specific quantity calculation logic
        let subscriptionTotalQty = 0;
        let calculatedAltQty = null;

        switch (logicDeliverySchedule) {
          case 'DAILY':
            // For Day1-Day2 pattern with alternating quantities
            if (altQty) {
              const days1 = Math.ceil(subscriptionPeriod / 2);
              const days2 = Math.floor(subscriptionPeriod / 2);
              subscriptionTotalQty = subscriptionQty * days1 + parseInt(altQty, 10) * days2;
              calculatedAltQty = parseInt(altQty, 10);
            } else {
              subscriptionTotalQty = subscriptionQty * subscriptionPeriod;
            }
            break;
          
          case 'ALTERNATE_DAYS':
            // For alternate day delivery
            const deliveryCount = Math.ceil(subscriptionPeriod / 2);
            subscriptionTotalQty = subscriptionQty * deliveryCount;
            break;
          
          case 'WEEKDAYS':
            // For selected days pattern
            if (weekdays && weekdays.length > 0) {
              const startDateObj = new Date(sDate); // Use a new object to avoid mutation
              const endDateObj = new Date(calculatedExpiryDate);
              
              let count = 0;
              for (let d = startDateObj; d <= endDateObj; d.setDate(d.getDate() + 1)) {
                const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
                if (weekdays.includes(day.substring(0, 3).toLowerCase())) {
                  count++;
                }
              }
              subscriptionTotalQty = subscriptionQty * count;
            } else {
              subscriptionTotalQty = subscriptionQty * subscriptionPeriod;
            }
            break;
          
          default:
            subscriptionTotalQty = subscriptionQty * subscriptionPeriod;
        }

        // 3. Update the total amount calculation
        totalAmount += sellingPrice * subscriptionTotalQty;
        totalQty += subscriptionTotalQty;

        // Store processed data for subscription creation later
        processedSubscriptions.push({
          depotVariant,
          sellingPrice,
          sDate,
          subscriptionPeriod,
          calculatedExpiryDate,
          dbDeliverySchedule,
          weekdays,
          subscriptionQty,
          calculatedAltQty,
          subscriptionTotalQty,
        });
      }

      const walletAmountToUse = parseFloat(walletamt) || 0;

      if (walletAmountToUse < 0) {
        throw new Error('Wallet amount cannot be negative.');
      }
      if (walletAmountToUse > totalAmount) {
        throw new Error('Wallet amount cannot exceed the total order amount.');
      }

      if (walletAmountToUse > 0) {
        const currentMember = await tx.member.findUnique({ where: { id: memberId } });
        if (!currentMember || currentMember.walletBalance < walletAmountToUse) {
          throw new Error('Insufficient wallet balance.');
        }
      }

      const payableamt = totalAmount - walletAmountToUse;
      const orderNo = `ORD-${Date.now()}`;
      const paymentStatus = payableamt === 0 ? 'PAID' : 'PENDING';

      // Create the ProductOrder
      const newOrder = await tx.productOrder.create({
        data: {
          orderNo: orderNo,
          memberId: memberId,
          totalQty,
          totalAmount,
          walletamt: walletAmountToUse,
          paymentStatus,
        },
      });

      // Create each Subscription and link it to the new ProductOrder
      const createdSubscriptions = [];
      for (const subData of processedSubscriptions) {
        // 4. Update the subscription creation data
        const newSubscription = await tx.subscription.create({
          data: {
            member: { connect: { id: memberId } },
            deliveryAddress: { connect: { id: parseInt(deliveryAddressId, 10) } },
            product: { connect: { id: subData.depotVariant.productId } },
            startDate: subData.sDate,
            period: subData.subscriptionPeriod,
            expiryDate: subData.calculatedExpiryDate,
            deliverySchedule: subData.dbDeliverySchedule,
            weekdays: subData.dbDeliverySchedule === 'WEEKDAYS' ? JSON.stringify(subData.weekdays) : null,
            qty: subData.subscriptionQty,
            altQty: subData.calculatedAltQty,
            rate: subData.sellingPrice,
            totalQty: subData.subscriptionTotalQty,
            amount: subData.sellingPrice * subData.subscriptionTotalQty,
            productOrder: { connect: { id: newOrder.id } },
          },
        });
        createdSubscriptions.push(newSubscription);
      }
      
      if (walletAmountToUse > 0) {
        await tx.member.update({
            where: { id: memberId },
            data: { walletBalance: { decrement: walletAmountToUse } },
        });
      }

      return { order: newOrder, subscriptions: createdSubscriptions };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating subscription with order:', error);
    res.status(400).json({ message: error.message });
  }
});

const getAllProductOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = '', paymentStatus = '' } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const where = {};

  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }

  if (search) {
    where.OR = [
      { orderNo: { contains: search } },
      { member: { name: { contains: search } } },
      { member: { user: { email: { contains: search } } } },
      { member: { user: { mobile: { contains: search } } } },
    ];
  }

  try {
    const [productOrders, totalCount] = await prisma.$transaction([
      prisma.productOrder.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          member: {
            include: {
              user: true,
            },
          },
          subscriptions: {
            include: {
              product: true,
            },
          },
        },
      }),
      prisma.productOrder.count({ where }),
    ]);

    const ordersWithComputedFields = productOrders.map(order => {
      const walletPaid = order.walletAmountPaid ?? 0;
      const payableamt = order.totalAmount - walletPaid;
      return {
        ...order,
        payableamt,
        receivedamt: order.totalPaidAmount ?? 0,
        walletamt: walletPaid,
      };
    });

    res.status(200).json({
      data: ordersWithComputedFields,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error('Error fetching product orders:', error);
    res.status(500).json({ message: 'Failed to fetch product orders' });
  }
});

const getProductOrderById = asyncHandler(async (req, res) => {
    const productOrder = await prisma.productOrder.findUnique({
        where: { id: parseInt(req.params.id, 10) },
        include: { member: true, subscriptions: true },
    });
    if (!productOrder) {
        res.status(404);
        throw new Error('Product order not found');
    }
    res.status(200).json({ success: true, data: productOrder });
});

const updateProductOrder = asyncHandler(async (req, res) => {
    const productOrder = await prisma.productOrder.update({
        where: { id: parseInt(req.params.id, 10) },
        data: req.body,
    });
    res.status(200).json({ success: true, data: productOrder });
});


// @desc    Update payment details for a product order and all linked subscriptions
// @route   PUT /api/product-orders/:id/payment
// @access  Private (ADMIN)
const updateProductOrderPayment = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.id, 10);

  if (!orderId) {
    return res.status(400).json({ message: 'Order ID is required' });
  }

  const {
    paymentMode,
    paymentReference,
    paymentDate,
    paymentStatus, // Expected 'PAID' or 'FAILED'
    receivedAmount,
  } = req.body;

  if (!['PAID', 'FAILED'].includes(paymentStatus)) {
    return res.status(400).json({ message: 'Invalid paymentStatus. Allowed values: PAID, FAILED' });
  }

  const order = await prisma.productOrder.findUnique({
    where: { id: orderId },
    include: { subscriptions: true },
  });

  if (!order) {
    return res.status(404).json({ message: 'Product order not found' });
  }

  // Validation: receivedAmount must equal order.payableamt when marking as PAID
  const received = parseFloat(receivedAmount);
  if (paymentStatus === 'PAID') {
    const walletPaid = order.walletAmountPaid ?? 0;
    const payable = order.totalAmount - walletPaid;
    const total = order.totalAmount ?? 0;

    // Allow received to match totalAmount if payable is 0 (workaround for old orders)
    const isValidAmount = (received === payable) || (payable === 0 && received === total);

    if (isNaN(received) || !isValidAmount) {
      const expectedAmount = (payable === 0 && total > 0) ? total : payable;
      return res.status(400).json({ message: `Received amount (₹${received.toFixed(2)}) must equal payable amount (₹${expectedAmount.toFixed(2)}) to mark as PAID.` });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update the product order itself
      await tx.productOrder.update({
        where: { id: orderId },
        data: {
          paymentMode,
          paymentReferenceNo: paymentReference,
          paymentDate: paymentDate ? new Date(paymentDate) : null,
          paymentStatus,
          receivedamt: received,
        },
      });

      // 2. Update each linked subscription, correcting their financial details
      for (const sub of order.subscriptions) {
        // Distribute the order-level wallet deduction proportionally to each subscription
        const subWalletShare = order.totalAmount > 0 ? (sub.amount / order.totalAmount) * (order.walletAmountPaid ?? 0) : 0;
        const subPayableAmt = sub.amount - subWalletShare;

        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            paymentMode,
            paymentReferenceNo: paymentReference,
            paymentDate: paymentDate ? new Date(paymentDate) : null,
            paymentStatus,
            walletamt: subWalletShare, // Correct the wallet amount
            payableamt: subPayableAmt, // Correct the payable amount
            // Set received amount only if PAID, otherwise keep original value
            receivedamt: paymentStatus === 'PAID' ? subPayableAmt : sub.receivedamt,
          },
        });
      }

      // 3. Fetch and return the final, fully updated order data
      const finalUpdatedOrder = await tx.productOrder.findUnique({
        where: { id: orderId },
        include: { subscriptions: true },
      });

      return finalUpdatedOrder;
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Error updating product order payment:', error);
    return res.status(500).json({ message: 'Failed to update payment' });
  }
});

module.exports = {
    createOrderWithSubscriptions,
    getAllProductOrders,
    getProductOrderById,
    updateProductOrder,
    updateProductOrderPayment,
};
