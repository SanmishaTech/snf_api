const asyncHandler = require('express-async-handler');
const { PrismaClient } = require('@prisma/client');

// Helper function to get the correct price based on the subscription period
const getPriceForPeriod = (depotVariant, periodInDays) => {
  // Prices are checked from the longest period to the shortest to ensure the best rate is applied.
  if (periodInDays >= 30 && depotVariant.price1Month) {
    return Number(depotVariant.price1Month);
  }
  if (periodInDays >= 15 && depotVariant.price15Day) {
    return Number(depotVariant.price15Day);
  }
  if (periodInDays >= 7 && depotVariant.price7Day) {
    return Number(depotVariant.price7Day);
  }
  if (periodInDays >= 3 && depotVariant.price3Day) {
    return Number(depotVariant.price3Day);
  }
  // Fallback to the default selling price if no specific period price is applicable.
  return Number(depotVariant.sellingPrice);
};
const prisma = new PrismaClient();

// Helper function to get day key from day index (0 for Sunday, 1 for Monday, etc.)
const getDayKey = (dayIndex) => {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIndex];
};

// Helper function to generate delivery dates and their quantities
const generateDeliveryDates = (startDate, periodInDays, deliveryScheduleType, qty, altQty, selectedWeekdays = []) => {
  console.log(`[generateDeliveryDates ENTRY] StartDate: ${new Date(startDate).toISOString()}, Period: ${periodInDays}, ScheduleType: ${deliveryScheduleType}, Qty: ${qty}, AltQty: ${altQty}, SelectedWeekdays: ${JSON.stringify(selectedWeekdays)}`);
  const deliveries = [];
  const baseStartDate = new Date(startDate);

  const lowerSelectedWeekdays = Array.isArray(selectedWeekdays) ? selectedWeekdays.map(day => day.toLowerCase()) : [];
  
  const hasValidAltQty = altQty && typeof altQty === 'number' && altQty > 0;
  let effectiveScheduleType = deliveryScheduleType; // Initialize with the passed type

  // Determine the final effective schedule type for internal logic
  if (deliveryScheduleType === 'VARYING') {
    effectiveScheduleType = hasValidAltQty ? 'VARYING_ALTERNATING' : 'DAILY';
  } else if (deliveryScheduleType === 'ALTERNATE_DAYS') {
    // If 'ALTERNATE_DAYS' is chosen directly, and altQty might be provided for varying quantities on those alternate days.
    effectiveScheduleType = 'ALTERNATE_DAYS_LOGIC'; 
  }
  // If deliveryScheduleType is 'SELECT_DAYS' or 'DAILY', effectiveScheduleType remains as is (from initialization).
  
  console.log(`[generateDeliveryDates] Computed effectiveScheduleType: ${effectiveScheduleType}`);

  let deliveryCountForAlternating = 0; // Used for VARYING_ALTERNATING and ALTERNATE_DAYS_LOGIC with altQty

  for (let i = 0; i < periodInDays; i++) {
    // Construct currentDate at midnight UTC for the target day
    const currentDate = new Date(Date.UTC(
      baseStartDate.getUTCFullYear(),
      baseStartDate.getUTCMonth(),
      baseStartDate.getUTCDate() + i
    ));
    // currentDate is now effectively YYYY-MM-DDT00:00:00.000Z

    let shouldAddDelivery = false;
    let currentQuantity = qty; // Default to primary quantity

    if (effectiveScheduleType === 'DAILY') {
      shouldAddDelivery = true;
      currentQuantity = qty;
    } else if (effectiveScheduleType === 'ALTERNATE_DAYS_LOGIC') {
      if (i % 2 === 0) { // Delivery on 0th, 2nd, 4th... day relative to period start
        shouldAddDelivery = true;
        if (hasValidAltQty) {
          currentQuantity = (deliveryCountForAlternating % 2 === 0) ? qty : altQty;
          deliveryCountForAlternating++;
        } else {
          currentQuantity = qty;
        }
      }
    } else if (effectiveScheduleType === 'VARYING_ALTERNATING') {
      // VARYING schedule type from frontend with a valid altQty.
      // Delivery every day, quantity alternates between qty and altQty.
      shouldAddDelivery = true;
      currentQuantity = (i % 2 === 0) ? qty : altQty; // Start with qty on day 0
    } else if (effectiveScheduleType === 'SELECT_DAYS') {
      const currentDayKey = getDayKey(currentDate.getUTCDay()); // Use getUTCDay() for UTC-based day index
      console.log(`[SELECT_DAYS_DEBUG] Date: ${currentDate.toISOString().split('T')[0]}, DayKey: ${currentDayKey}, Selected: ${JSON.stringify(lowerSelectedWeekdays)}, Includes: ${lowerSelectedWeekdays.includes(currentDayKey)}`);
      if (lowerSelectedWeekdays.includes(currentDayKey)) {
        shouldAddDelivery = true;
        currentQuantity = qty;
      }
    }

    if (shouldAddDelivery) {
      deliveries.push({ date: currentDate, quantity: currentQuantity });
    }
  }
  return deliveries;
};

// @desc    Create a new product order with multiple subscriptions
// @route   POST /api/product-orders/with-subscriptions
// @access  Private
const createOrderWithSubscriptions = asyncHandler(async (req, res) => {
  const { subscriptions, deliveryAddressId, walletamt } = req.body;
  const member = req.user;

  if (!member) {
    res.status(401);
    throw new Error('User not authenticated');
  }
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    res.status(400);
    throw new Error('Subscriptions array is required and cannot be empty.');
  }
  // Note: deliveryAddressId validation moved inside transaction to check depot type

  try {
    const result = await prisma.$transaction(async (tx) => {
      const memberRecord = await tx.member.findUnique({
        where: { userId: member.id },
        select: { id: true, walletBalance: true },
      });

      if (!memberRecord) {
        throw new Error('Member profile not found for the authenticated user.');
      }
      const memberId = memberRecord.id;

      const depotVariantIds = subscriptions.map(sub => parseInt(sub.productId, 10));
      const depotVariants = await tx.depotProductVariant.findMany({
        where: { id: { in: depotVariantIds } },
        include: { depot: true },
      });
      const depotVariantMap = new Map(depotVariants.map(v => [v.id, v]));

      // Determine if any subscription is for an online depot
      const isAnyDepotOnline = depotVariants.some(v => v.depot.isOnline);

      // Validate deliveryAddressId only if an online depot is involved
      if (isAnyDepotOnline && !deliveryAddressId) {
        throw new Error('deliveryAddressId is required for online depot subscriptions.');
      }

      // Fetch delivery address only if an ID is provided
      let deliveryAddress = null;
      if (deliveryAddressId) {
        deliveryAddress = await tx.deliveryAddress.findUnique({
          where: { id: parseInt(deliveryAddressId, 10) },
          include: {
            location: {
              include: { agency: true },
            },
          },
        });
        // Further validation after fetching address
        if (isAnyDepotOnline && !deliveryAddress) {
          throw new Error('Delivery address could not be found.');
        }
      }

      const processedSubscriptions = [];
      const allDeliveryScheduleEntries = [];
      let totalAmount = 0;
      let totalQty = 0;
      let agentId = null; // To hold a single agent ID if consistent across all subs
      let dbDeliveryScheduleEnum;

      for (const sub of subscriptions) {
        const {
          productId,
          period,
          startDate,
          deliverySchedule: rawDeliverySchedule,
          weekdays,
          qty,
          altQty,
        } = sub;

        if (!productId || !period || !startDate || !rawDeliverySchedule || !qty) {
          throw new Error('Missing required fields for one or more subscriptions.');
        }

        const depotVariant = depotVariantMap.get(sub.productId);
        if (!depotVariant || !depotVariant.sellingPrice) {
          throw new Error(`Depot product variant with ID ${sub.productId} not found or is missing a valid rate.`);
        }

        const parsedQty = parseInt(qty, 10);
        const parsedAltQty = altQty ? parseInt(altQty, 10) : null;
        const subscriptionPeriod = parseInt(period, 10);
        const sDate = new Date(startDate);
        let expiryDate = new Date(sDate);
        expiryDate.setDate(expiryDate.getDate() + subscriptionPeriod - 1);

        let internalScheduleLogicType;

        switch (rawDeliverySchedule.toUpperCase()) {
          case 'DAILY':
            internalScheduleLogicType = 'DAILY';
            dbDeliveryScheduleEnum = 'DAILY';
            break;
          case 'SELECT-DAYS':
            internalScheduleLogicType = 'SELECT_DAYS';
            dbDeliveryScheduleEnum = 'WEEKDAYS';
            break;
          case 'ALTERNATE-DAYS':
            internalScheduleLogicType = 'ALTERNATE_DAYS';
            dbDeliveryScheduleEnum = 'ALTERNATE_DAYS';
            break;
          case 'DAY1-DAY2': // Fall-through to handle like VARYING
          case 'VARYING':
            internalScheduleLogicType = 'VARYING'; // This will be resolved to VARYING_ALTERNATING or DAILY in generateDeliveryDates
            dbDeliveryScheduleEnum = 'DAY1_DAY2';
            break;
          default:
            throw new Error(`Invalid delivery schedule type: ${rawDeliverySchedule}`);
        }

        const deliveryScheduleDetails = generateDeliveryDates(
          sDate,
          subscriptionPeriod,
          internalScheduleLogicType,
          parsedQty,
          parsedAltQty,
          weekdays
        );

        const subscriptionTotalQty = deliveryScheduleDetails.reduce((sum, entry) => sum + entry.quantity, 0);
        const rateForPeriod = getPriceForPeriod(depotVariant, subscriptionPeriod);
        if (rateForPeriod === null || rateForPeriod === undefined) {
          throw new Error(`Price not found for product variant ${depotVariant.id} and period ${subscriptionPeriod} days.`);
        }

        const subscriptionAmount = Number(rateForPeriod) * subscriptionTotalQty;
        totalAmount += subscriptionAmount;
        totalQty += subscriptionTotalQty;

        // Agent assignment logic
        const depot = depotVariant.depot;

        if (depot?.isOnline) {
          // If depot is online, use agent from the delivery location
          if (deliveryAddress?.location?.agencyId) {
            agentId = deliveryAddress.location.agencyId;
          }
        } else if (depot) {
          // If depot is not online, use agent from the depot itself
          const agency = await tx.agency.findUnique({ where: { depotId: depot.id } });
          if (agency) {
            agentId = agency.id;
          }
        }

        processedSubscriptions.push({
          productId: sub.productId,
          depotVariant,
          period: subscriptionPeriod,
          startDate: sDate,
          expiryDate,
          deliverySchedule: dbDeliveryScheduleEnum,
          weekdays,
          qty: parsedQty,
          altQty: parsedAltQty,
          totalQty: subscriptionTotalQty,
          rate: rateForPeriod,
          amount: subscriptionAmount,
          agentId,
          deliveryScheduleDetails,
        });
      }

      const walletAmountToUse = Math.min(parseFloat(walletamt) || 0, memberRecord.walletBalance);
      if (walletAmountToUse < 0) {
        throw new Error('Wallet amount cannot be negative.');
      }
      
      const payableamt = totalAmount - walletAmountToUse;
      const paymentStatus = payableamt <= 0 ? 'PAID' : 'PENDING';

      const newOrderData = {
        orderNo: `ORD-${Date.now()}`,
        memberId,
        totalQty,
        totalAmount,
        walletamt: walletAmountToUse,
        payableamt,
        paymentStatus,
      };

      if (agentId) {
        newOrderData.agencyId = agentId;
      }

      const newOrder = await tx.productOrder.create({ data: newOrderData });

      for (const subData of processedSubscriptions) {
        const subscriptionWalletShare = totalAmount > 0 ? (subData.amount / totalAmount) * walletAmountToUse : 0;
        const subscriptionPayable = subData.amount - subscriptionWalletShare;
        const subPaymentStatus = subscriptionPayable <= 0 ? 'PAID' : 'PENDING';

        const subscriptionData = {
          member: { connect: { id: memberId } },
          product: { connect: { id: subData.depotVariant.productId } },
          depotProductVariant: { connect: { id: subData.depotVariant.id } },
          productOrder: { connect: { id: newOrder.id } },
          period: subData.period,
          startDate: subData.startDate,
          expiryDate: subData.expiryDate,
          deliverySchedule: subData.deliverySchedule,
          weekdays: subData.deliverySchedule === 'WEEKDAYS' ? JSON.stringify(subData.weekdays) : null,
          qty: subData.qty,
          altQty: subData.altQty,
          totalQty: subData.totalQty,
          rate: subData.rate,
          amount: subData.amount,
          walletamt: subscriptionWalletShare,
          payableamt: subscriptionPayable,
          paymentStatus: subPaymentStatus,
        };

        // For online depots, connect the delivery address from the request.
        // For offline depots, the delivery address will be null (by omitting the field).
        if (subData.depotVariant.depot.isOnline) {
          if (!deliveryAddressId) {
            // This should be caught by the initial validation, but as a safeguard.
            throw new Error('A delivery address is required for online depot subscriptions.');
          }
          subscriptionData.deliveryAddress = {
            connect: { id: parseInt(deliveryAddressId, 10) },
          };
        }

        if (subData.agentId) {
          subscriptionData.agency = { connect: { id: subData.agentId } };
        }

        const newSubscription = await tx.subscription.create({
          data: subscriptionData,
        });

        const entriesForThisSub = subData.deliveryScheduleDetails.map(entry => ({
          subscriptionId: newSubscription.id,
          memberId: memberId,
          deliveryAddressId: deliveryAddressId ? parseInt(deliveryAddressId, 10) : null,
          productId: subData.depotVariant.productId,
          deliveryDate: entry.date,
          quantity: entry.quantity,
          status: 'PENDING',
        }));
        allDeliveryScheduleEntries.push(...entriesForThisSub);
      }
      
      if (walletAmountToUse > 0) {
        await tx.member.update({
          where: { id: memberId },
          data: { walletBalance: { decrement: walletAmountToUse } },
        });
      }

      if (allDeliveryScheduleEntries.length > 0) {
        await tx.deliveryScheduleEntry.createMany({
          data: allDeliveryScheduleEntries,
        });
      }

      const finalOrder = await tx.productOrder.findUnique({
        where: { id: newOrder.id },
        include: { subscriptions: { include: { deliveryScheduleEntries: true } } },
      });

      return { order: finalOrder };
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
