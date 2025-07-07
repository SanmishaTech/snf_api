const asyncHandler = require('express-async-handler');
const { PrismaClient } = require('@prisma/client');

// Helper function to get the correct price based on the subscription period
const getPriceForPeriod = (depotVariant, periodInDays) => {
  const toNumber = (val) => {
    const num = Number(val);
    return Number.isFinite(num) && num > 0 ? num : undefined;
  };

  let periodPrice;
  switch (periodInDays) {
    case 3:
      periodPrice = toNumber(depotVariant.price3Day);
      break;
    case 15:
      periodPrice = toNumber(depotVariant.price15Day);
      break;
    case 30:
      periodPrice = toNumber(depotVariant.price1Month);
      break;
  }

  // Fallback chain: period price -> buyOncePrice -> MRP
  return periodPrice ?? toNumber(depotVariant.buyOncePrice) ?? toNumber(depotVariant.mrp) ?? 0;
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

  // Input validation
  if (!member) {
    res.status(401);
    throw new Error('User not authenticated');
  }
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    res.status(400);
    throw new Error('Subscriptions array is required and cannot be empty.');
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get member details
      const memberRecord = await tx.member.findUnique({
        where: { userId: member.id },
        select: { id: true, walletBalance: true },
      });

      if (!memberRecord) {
        throw new Error('Member profile not found for the authenticated user.');
      }

      const memberId = memberRecord.id;

      // Fetch depot variants and validate
      const depotVariantIds = subscriptions.map(sub => parseInt(sub.productId, 10));
      const depotVariants = await tx.depotProductVariant.findMany({
        where: { id: { in: depotVariantIds } },
        select: {
          id: true,
          name: true,
          mrp: true,
          price3Day: true,
          price15Day: true,
          price1Month: true,
          buyOncePrice: true,
          depotId: true,
          productId: true,
          depot: true,
          product: {
            select: {
              id: true,
              name: true,
              unit: true,
            }
          },
        }
      });
      const depotVariantMap = new Map(depotVariants.map(v => [v.id, v]));

      // Address validation for online depots
      const isAnyDepotOnline = depotVariants.some(v => v.depot.isOnline);
      let deliveryAddress = null;
      
      if (isAnyDepotOnline) {
        if (!deliveryAddressId) {
          throw new Error('deliveryAddressId is required for online depot subscriptions.');
        }
        
        deliveryAddress = await tx.deliveryAddress.findUnique({
          where: { id: parseInt(deliveryAddressId, 10) },
          include: { location: { include: { agency: true } } },
        });
        
        if (!deliveryAddress) {
          throw new Error('Delivery address could not be found.');
        }
      }

      // Process subscriptions and calculate amounts
      const processedSubscriptions = [];
      const allDeliveryScheduleEntries = [];
      const financialSummary = {
        totalAmount: 0,
        totalQty: 0,
        subscriptionDetails: []
      };

      for (const sub of subscriptions) {
        const subscriptionData = await processSubscription(
          sub, 
          depotVariantMap, 
          deliveryAddress, 
          tx
        );
        
        processedSubscriptions.push(subscriptionData);
        financialSummary.totalAmount += subscriptionData.amount;
        financialSummary.totalQty += subscriptionData.totalQty;
        
        // Store subscription financial details for later wallet distribution
        financialSummary.subscriptionDetails.push({
          id: subscriptionData.productId,
          amount: subscriptionData.amount,
          index: processedSubscriptions.length - 1
        });
      }

      // Calculate wallet and payment amounts
      const walletCalculation = calculateWalletDistribution(
        financialSummary.totalAmount,
        walletamt || 0,
        memberRecord.walletBalance,
        financialSummary.subscriptionDetails
      );
      console.log("Pasdasdasd",walletCalculation)

      // Create order with financial summary
      const orderData = {
        orderNo: `ORD-${Date.now()}`,
        memberId,
        totalQty: financialSummary.totalQty,
        totalAmount: financialSummary.totalAmount,
        walletamt: walletCalculation.walletAmountUsed,
        payableamt: walletCalculation.totalPayableAmount,
        paymentStatus: walletCalculation.totalPayableAmount <= 0 ? 'PAID' : 'PENDING',
      };

      // Set agent if consistent across subscriptions
      const agentId = getConsistentAgentId(processedSubscriptions);
      if (agentId) {
        orderData.agencyId = agentId;
      }

      const newOrder = await tx.productOrder.create({
        data: {
          ...orderData,
          walletamt: walletCalculation.walletAmountUsed,
          payableamt: walletCalculation.totalPayableAmount,
        },
      });

      // Create subscriptions with distributed wallet amounts
      for (let i = 0; i < processedSubscriptions.length; i++) {
        const subData = processedSubscriptions[i];
        const walletShare = walletCalculation.subscriptionWalletShares[i];
        
        const subscriptionPayable = subData.amount - walletShare;
        const subPaymentStatus = subscriptionPayable <= 0 ? 'PAID' : 'PENDING';

        const subscriptionDbData = {
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
          walletamt: walletShare,
          payableamt: subscriptionPayable,
          paymentStatus: subPaymentStatus,
        };

        // Add delivery address for online depots
        if (subData.depotVariant.depot.isOnline) {
          subscriptionDbData.deliveryAddress = {
            connect: { id: parseInt(deliveryAddressId, 10) },
          };
        }

        if (subData.agentId) {
          subscriptionDbData.agency = { connect: { id: subData.agentId } };
        }

        const newSubscription = await tx.subscription.create({
          data: subscriptionDbData,
        });

        // Create delivery schedule entries
        const deliveryEntries = subData.deliveryScheduleDetails.map(entry => ({
          subscriptionId: newSubscription.id,
          memberId: memberId,
          deliveryAddressId: deliveryAddressId ? parseInt(deliveryAddressId, 10) : null,
          productId: subData.depotVariant.productId,
          depotId: subData.depotVariant.depotId,
          depotProductVariantId: subData.depotVariant.id,
          deliveryDate: entry.date,
          quantity: entry.quantity,
          status: 'PENDING',
          agentId: subData.agentId,
        }));
        
        allDeliveryScheduleEntries.push(...deliveryEntries);
      }

      // Update member wallet balance
      if (walletCalculation.walletAmountUsed > 0) {
        await tx.member.update({
          where: { id: memberId },
          data: { 
            walletBalance: { decrement: walletCalculation.walletAmountUsed } 
          },
        });
      }

      // Create delivery schedule entries
      if (allDeliveryScheduleEntries.length > 0) {
        await tx.deliveryScheduleEntry.createMany({
          data: allDeliveryScheduleEntries,
        });
      }

      // Return complete order with subscriptions
      const finalOrder = await tx.productOrder.findUnique({
        where: { id: newOrder.id },
        include: { 
          subscriptions: {
            include: {
              depotProductVariant: {
                include: {
                  depot: true,
                  product: true,
                },
              }
            }
          }
        },
      });

      return { 
        order: finalOrder,
        financialSummary: {
          totalAmount: financialSummary.totalAmount,
          walletAmountUsed: walletCalculation.walletAmountUsed,
          totalPayableAmount: walletCalculation.totalPayableAmount,
          paymentStatus: orderData.paymentStatus
        }
      };
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating subscription with order:', error);
    res.status(400).json({ message: error.message });
  }
});

// Helper function to calculate wallet distribution
function calculateWalletDistribution(totalAmount, requestedWalletAmount, availableWalletBalance, subscriptionDetails) {
  // Determine the total wallet amount to be used for the order, rounded to 2 decimal places.
  const walletAmountToUse = Math.min(
    Math.max(0, parseFloat(requestedWalletAmount) || 0),
    availableWalletBalance,
    totalAmount
  );
  const walletAmountUsed = Math.round(walletAmountToUse * 100) / 100;

  // Calculate the total payable amount for the order.
  const totalPayableAmount = totalAmount - walletAmountUsed;

  // Distribute the wallet amount across subscriptions.
  const subscriptionWalletShares = [];
  let distributedAmount = 0;

  if (totalAmount > 0 && walletAmountUsed > 0) {
    // Calculate shares for each subscription, rounding as we go.
    subscriptionDetails.forEach((sub, index) => {
      if (index === subscriptionDetails.length - 1) {
        // The last subscription gets the remainder to ensure the total is exact.
        const lastShare = walletAmountUsed - distributedAmount;
        subscriptionWalletShares.push(Math.round(lastShare * 100) / 100);
      } else {
        const proportionalShare = (sub.amount / totalAmount) * walletAmountUsed;
        const roundedShare = Math.round(proportionalShare * 100) / 100;
        subscriptionWalletShares.push(roundedShare);
        distributedAmount += roundedShare;
      }
    });
  } else {
    // If no wallet amount is used, or total amount is zero, all shares are zero.
    subscriptionDetails.forEach(() => subscriptionWalletShares.push(0));
  }

  return {
    walletAmountUsed,
    totalPayableAmount: Math.round(totalPayableAmount * 100) / 100,
    subscriptionWalletShares
  };
}

async function processSubscription(sub, depotVariantMap, deliveryAddress, tx) {
  const {
    productId,
    period,
    startDate,
    deliverySchedule: rawDeliverySchedule,
    weekdays,
    qty,
    altQty,
  } = sub;

  // Validation
  if (!productId || !period || !startDate || !rawDeliverySchedule || !qty) {
    throw new Error('Missing required fields for subscription.');
  }

  const depotVariant = depotVariantMap.get(parseInt(productId, 10));
  if (!depotVariant || !depotVariant.product) {
    throw new Error(`Product information is missing for depot product variant with ID ${productId}.`);
  }

  // Parse and calculate dates
  const parsedQty = parseInt(qty, 10);
  const parsedAltQty = altQty ? parseInt(altQty, 10) : null;
  const subscriptionPeriod = parseInt(period, 10);
  const sDate = new Date(startDate);
  const expiryDate = new Date(sDate);
  expiryDate.setDate(expiryDate.getDate() + subscriptionPeriod - 1);

  // Process delivery schedule
  const { internalScheduleLogicType, dbDeliveryScheduleEnum } = mapDeliverySchedule(rawDeliverySchedule);

  const deliveryScheduleDetails = generateDeliveryDates(
    sDate,
    subscriptionPeriod,
    internalScheduleLogicType,
    parsedQty,
    parsedAltQty,
    weekdays
  );

  // Calculate amounts
  const subscriptionTotalQty = deliveryScheduleDetails.reduce((sum, entry) => sum + entry.quantity, 0);
  const rateForPeriod = getPriceForPeriod(depotVariant, subscriptionPeriod);

  const subscriptionAmount = rateForPeriod * subscriptionTotalQty;

  // Determine agent
  const agentId = await determineAgentId(depotVariant.depot, deliveryAddress, tx);

  return {
    productId: parseInt(productId, 10),
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
  };
}

// Helper function to map delivery schedule types
function mapDeliverySchedule(rawDeliverySchedule) {
  const scheduleMap = {
    'DAILY': { internal: 'DAILY', db: 'DAILY' },
    'SELECT-DAYS': { internal: 'SELECT_DAYS', db: 'WEEKDAYS' },
    'ALTERNATE-DAYS': { internal: 'ALTERNATE_DAYS', db: 'ALTERNATE_DAYS' },
    'DAY1-DAY2': { internal: 'VARYING', db: 'DAY1_DAY2' },
    'VARYING': { internal: 'VARYING', db: 'DAY1_DAY2' }
  };

  const mapped = scheduleMap[rawDeliverySchedule.toUpperCase()];
  if (!mapped) {
    throw new Error(`Invalid delivery schedule type: ${rawDeliverySchedule}`);
  }

  return {
    internalScheduleLogicType: mapped.internal,
    dbDeliveryScheduleEnum: mapped.db
  };
}

// Helper function to determine agent ID
async function determineAgentId(depot, deliveryAddress, tx) {
  if (depot?.isOnline) {
    return deliveryAddress?.location?.agencyId || null;
  } else if (depot) {
    const agency = await tx.agency.findUnique({ where: { depotId: depot.id } });
    return agency?.id || null;
  }
  return null;
}

// Helper function to get consistent agent ID across subscriptions
function getConsistentAgentId(processedSubscriptions) {
  const agentIds = processedSubscriptions.map(sub => sub.agentId).filter(Boolean);
  const uniqueAgentIds = [...new Set(agentIds)];
  
  // Return agent ID only if all subscriptions have the same agent
  return uniqueAgentIds.length === 1 ? uniqueAgentIds[0] : null;
}
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
              product: {
                include: {
                  depotProductVariants: {
                    select: {
                      price15Day: true,
                      price1Month: true,
                      buyOncePrice: true,
                    },
                  },
                },
              },
              depotProductVariant: {
                select: {
                  id: true,
                  name: true,
                  mrp: true,
                },
              },
              deliveryAddress: true,
              agency: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      }),
      prisma.productOrder.count({ where }),
    ]);

    // Debug: Log the first order's subscription data
    if (productOrders.length > 0 && productOrders[0].subscriptions.length > 0) {
      console.log('Debug - First subscription data:', {
        subscriptionId: productOrders[0].subscriptions[0].id,
        depotProductVariantId: productOrders[0].subscriptions[0].depotProductVariantId,
        depotProductVariant: productOrders[0].subscriptions[0].depotProductVariant,
        productId: productOrders[0].subscriptions[0].productId,
        product: productOrders[0].subscriptions[0].product?.name
      });
    }

    const ordersWithComputedFields = productOrders.map(order => {
      // Prefer explicitly stored columns if they exist, otherwise fall back to legacy/computed values
      const walletamt = order.walletamt ?? order.walletAmountPaid ?? 0;
      const payableamt = order.payableamt ?? (order.totalAmount - walletamt);
      const receivedamt = order.receivedamt ?? order.totalPaidAmount ?? 0;

      return {
        ...order,
        walletamt,
        payableamt,
        receivedamt,
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
        include: { 
          member: true, 
          subscriptions: {
            include: {
              product: true,
              depotProductVariant: {
                select: {
                  id: true,
                  name: true,
                  mrp: true,
                },
              },
              deliveryAddress: true,
              agency: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
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
    include: { 
      subscriptions: {
        include: {
          depotProductVariant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return res.status(404).json({ message: 'Product order not found' });
  }

  // Validation: receivedAmount must equal order.payableamt when marking as PAID
  const received = parseFloat(receivedAmount);
  if (paymentStatus === 'PAID') {
    const walletPaid = order.walletamt ?? order.walletAmountPaid ?? 0;
    const payable = order.payableamt ?? (order.totalAmount - walletPaid);
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
        const subWalletShare = order.totalAmount > 0 ? (sub.amount / order.totalAmount) * (order.walletamt ?? order.walletAmountPaid ?? 0) : 0;
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
        include: { 
          subscriptions: {
            include: {
              depotProductVariant: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
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
