const asyncHandler = require('express-async-handler');
const { PrismaClient, TransactionStatus, TransactionType } = require('@prisma/client');
const prisma = new PrismaClient();
const { isAfter, startOfDay } = require('date-fns');
const { createInvoiceForOrder } = require('../services/invoiceService');
const walletService = require('../services/walletService');

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

// @desc    Create new subscription
// @route   POST /api/subscriptions
// @access  Private
const createSubscription = asyncHandler(async (req, res) => {
  let {
    productId,
    deliveryAddressId,
    period,
    deliverySchedule: rawDeliverySchedule,
    weekdays,
    qty,
    altQty,
    startDate,
    deliveryInstructions
  } = req.body;

  let deliverySchedule;
  switch (rawDeliverySchedule) {
    case 'SELECT-DAYS': // Match uppercase hyphenated as seen in logs
      deliverySchedule = 'SELECT_DAYS'; // Set to underscore version for backend logic
      break;
    case 'DAILY': // Match uppercase as potentially seen in logs for 'daily'
      deliverySchedule = 'DAILY';
      break;
    case 'VARYING': // Match uppercase as potentially seen in logs for 'varying'
      deliverySchedule = 'VARYING';
      break;
    // case 'ALTERNATE-DAYS': // Example if frontend ever sends this directly (uppercase hyphenated)
    //   deliverySchedule = 'ALTERNATE_DAYS'; // Set to underscore version
    //   break;
    default:
      // If it's already in the correct Prisma enum format (e.g. 'ALTERNATE_DAYS') or an unhandled value
      deliverySchedule = rawDeliverySchedule;
      // Check against the backend's expected underscore/standard formats
      if (!['DAILY', 'SELECT_DAYS', 'VARYING', 'ALTERNATE_DAYS'].includes(deliverySchedule)) {
        console.warn(`[SubscriptionController] Unmapped or unexpected deliverySchedule value '${rawDeliverySchedule}' received. Proceeding with the raw value: '${deliverySchedule}'`);
        // For stricter validation, you might return an error:
        // res.status(400).json({ message: `Invalid delivery schedule option: ${rawDeliverySchedule}` });
        // return;
      }
      break;
  }

  
  // Log the request body for debugging
  console.log('Request body:', req.body);
  console.log('[DEBUG] deliveryInstructions from request:', deliveryInstructions);

  // Get current user's member ID
  const member = await prisma.member.findUnique({
    where: { userId: req.user.id },
    select: { walletBalance: true, id: true, userId: true }
  });

  if (!member) {
    res.status(400);
    throw new Error('Member profile not found');
  }

  const parsedProductId = Number(productId);
  const parsedDeliveryAddressId = Number(deliveryAddressId);
  const parsedPeriod = Number(period);
  const parsedQty = Number(qty);
  const parsedAltQty = altQty ? Number(altQty) : null;

  if (isNaN(parsedProductId) || isNaN(parsedDeliveryAddressId) || isNaN(parsedPeriod) || isNaN(parsedQty)) {
    res.status(400);
    throw new Error('Invalid input types for IDs, period, or quantity.');
  }
  if (parsedAltQty !== null && isNaN(parsedAltQty)) {
    res.status(400);
    throw new Error('Invalid input type for alternate quantity.');
  }

  const product = await prisma.product.findUnique({ where: { id: parsedProductId } });
  if (!product) {
    return res.status(404).json({ message: 'Product not found' });
  }

  let baseDate = startDate ? new Date(startDate) : new Date();
  if (isNaN(baseDate.getTime())) {
    res.status(400);
    throw new Error('Invalid start date provided.');
  }
  // Convert to date-only preserving the user's intended date (not UTC date)
  // The frontend creates dates like "2025-07-31T18:30:00.000Z" when user selects Aug 1 in IST
  // This happens because frontend creates midnight local time, then converts to UTC
  // We need to determine the user's intended calendar date
  
  // Simple approach: Add 12 hours to the received timestamp to account for timezone differences
  // This ensures we get the correct calendar date that the user intended
  const adjustedDate = new Date(baseDate.getTime() + (12 * 60 * 60 * 1000)); // Add 12 hours
  
  const year = adjustedDate.getUTCFullYear();
  const month = adjustedDate.getUTCMonth();
  const day = adjustedDate.getUTCDate();
  const startDateOnly = new Date(Date.UTC(year, month, day));
  
  console.log(`[Date Processing] Frontend sent: ${startDate}`);
  console.log(`[Date Processing] Parsed as: ${baseDate.toString()}`);
  console.log(`[Date Processing] Adjusted date (+12h): ${adjustedDate.toString()}`);
  console.log(`[Date Processing] Final date parts: ${year}-${month + 1}-${day}`);
  console.log(`[Date Processing] Final startDate for storage: ${startDateOnly.toString()}`);
  let expiryDate = new Date(startDateOnly);
  // For buy-once orders (period = 0), start and expiry date should be the same
  // For subscription orders, expiry = start + period - 1
  if (parsedPeriod === 0) {
    // Buy-once: expiry date = start date (same day)
    console.log(`[Date Processing] Buy-once order: expiryDate = startDate`);
  } else {
    // Subscription: expiry date = start date + period - 1
    expiryDate.setDate(expiryDate.getDate() + parsedPeriod - 1);
    console.log(`[Date Processing] Subscription order: expiryDate = startDate + ${parsedPeriod} - 1`);
  }

  // Map deliverySchedule string to Prisma enum
  let internalScheduleLogicType; // For generateDeliveryDates logic
  let dbDeliveryScheduleEnum;    // For Prisma DB storage

  let effectiveRawSchedule = typeof rawDeliverySchedule === 'string' ? rawDeliverySchedule.toUpperCase() : '';

  switch (effectiveRawSchedule) {
    case 'DAILY':
      internalScheduleLogicType = 'DAILY';
      dbDeliveryScheduleEnum = 'DAILY';
      break;
    case 'WEEKDAYS': 
    case 'SELECT-DAYS':
      internalScheduleLogicType = 'SELECT_DAYS'; 
      dbDeliveryScheduleEnum = 'WEEKDAYS'; // Prisma enum is WEEKDAYS for this logic
      if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) {
        res.status(400);
        throw new Error('Weekdays must be provided for this schedule type.');
      }
      break;
    case 'ALTERNATE_DAYS':
    case 'ALTERNATE-DAYS':
      // Frontend expects true "alternate days" pattern (e.g., delivery on days 1,3,5...). Map accordingly.
      console.log('[SubscriptionController] Frontend sent deliverySchedule: "ALTERNATE_DAYS" – mapping to alternate-day delivery logic.');
      internalScheduleLogicType = 'ALTERNATE_DAYS_LOGIC'; // generateDeliveryDates handles every-other-day pattern
      dbDeliveryScheduleEnum = 'ALTERNATE_DAYS'; // Persist as ALTERNATE_DAYS enum in DB
      break;
    case 'VARYING':
      // VARYING from frontend implies daily deliveries with potentially different quantities (using altQty).
      // generateDeliveryDates handles the daily delivery with alternating quantity logic when type is 'VARYING'.
      // For DB storage, this pattern is essentially DAILY deliveries.
      console.log('[SubscriptionController] Frontend sent deliverySchedule: "VARYING". Interpreting as DAILY pattern with varying quantities, but storing as ALTERNATE_DAYS in DB as per user request.');
      internalScheduleLogicType = 'VARYING'; 
      dbDeliveryScheduleEnum = 'ALTERNATE_DAYS'; // Store as ALTERNATE_DAYS in DB
      break;
    default:
      res.status(400);
      throw new Error(`Invalid delivery schedule type: ${rawDeliverySchedule}`);
  }

  // Calculate totalQty and amount using the helper function
  const deliveryScheduleDetails = generateDeliveryDates(
    startDateOnly,
    parsedPeriod,
    internalScheduleLogicType, // Use the type for internal logic
    parsedQty,
    parsedAltQty,
    weekdays
  );

  if (!deliveryScheduleDetails || deliveryScheduleDetails.length === 0) {
    // This case might indicate an issue with generateDeliveryDates or invalid parameters leading to no schedule
    console.error('generateDeliveryDates returned no schedule details for:', { baseDate, parsedPeriod, prismaDeliveryScheduleEnum, parsedQty, parsedAltQty, weekdays });
    res.status(400);
    throw new Error('Could not generate a delivery schedule based on the provided inputs.');
  }

  const totalQty = deliveryScheduleDetails.reduce((sum, item) => sum + item.quantity, 0);
  
  // Calculate amount based on depot variant pricing and subscription period
  let unitPrice = 0;
  let amount = 0;
  let depotProductVariantId; // Store depot variant ID for later use
  
  if (parsedDeliveryAddressId) {
    // For home delivery subscriptions, fetch depot product variant pricing
    try {
      // First, get the delivery address to find the pincode
      const deliveryAddress = await prisma.deliveryAddress.findUnique({
        where: { id: parsedDeliveryAddressId }
      });
      
      if (deliveryAddress) {
        // Find depot product variant based on pincode area mapping
        const depotProductVariant = await prisma.depotProductVariant.findFirst({
          where: {
            productId: parsedProductId,
            depot: {
              areas: {
                some: {
                  pincodes: {
                    contains: deliveryAddress.pincode
                  }
                }
              }
            }
          }
        });
        
        if (depotProductVariant) {
          // Determine unit price based on subscription period
          switch (parsedPeriod) {
            case 1:
              unitPrice = parseFloat(depotProductVariant.buyOncePrice) || 0;
              break;
            case 3:
              unitPrice = parseFloat(depotProductVariant.price3Day) || 0;
              break;
            case 7:
              unitPrice = parseFloat(depotProductVariant.price7Day) || 0;
              break;
            case 15:
              unitPrice = parseFloat(depotProductVariant.price15Day) || 0;
              break;
            case 30:
              unitPrice = parseFloat(depotProductVariant.price1Month) || 0;
              break;
            default:
              // For other periods, use MRP or buyOncePrice as fallback
              unitPrice = parseFloat(depotProductVariant.mrp) || parseFloat(depotProductVariant.buyOncePrice) || 0;
          }
          
          // Store the depot variant ID to be used in subscription creation
          depotProductVariantId = depotProductVariant.id;
        }
      }
    } catch (error) {
      console.error('Error fetching depot product variant for pricing:', error);
      // Continue with amount = 0 if pricing lookup fails
    }
  }
  
  // Calculate total amount: unit price * total quantity
  amount = unitPrice * totalQty;

  // --- New Wallet Logic ---
  const walletBalance = member.walletBalance; // Wallet was included in the member query
  let walletamt = 0;
  let payableamt = amount;
  let newWalletBalance = walletBalance;
  let paymentStatus = 'PENDING'; // Default payment status

  if (walletBalance > 0) {
    if (walletBalance >= amount) {
      walletamt = amount;
      payableamt = 0;
      newWalletBalance = walletBalance - amount;
      paymentStatus = 'PAID'; // Fully paid from wallet
    } else {
      walletamt = walletBalance;
      payableamt = amount - walletBalance;
      newWalletBalance = 0;
      // paymentStatus remains 'PENDING' as there's a balance to be paid
    }
  }
  
  // --- Transactional Database Update ---
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Member WalletBalance (if amount used)
      if (walletamt > 0) {
        await tx.member.update({
          where: { id: member.id },
          data: { walletBalance: newWalletBalance },
        });
      }

      // Create a ProductOrder to wrap the subscription
      const newProductOrder = await tx.productOrder.create({
        data: {
          member: { connect: { id: member.id } },
          orderNo: `SNF-ORD-${Date.now()}`,
          totalQty: totalQty,
          totalAmount: amount,
          walletamt: walletamt,
          payableamt: payableamt,
          receivedamt: 0, // Default value
          paymentStatus: paymentStatus,
        },
      });


      // 2. Create the Subscription record with new fields
      const subscriptionData = {
        member: { connect: { id: member.id } },
        product: { connect: { id: parsedProductId } },
        productOrder: { connect: { id: newProductOrder.id } },
        startDate: startDateOnly,
        period: parsedPeriod,
        expiryDate,
        deliverySchedule: dbDeliveryScheduleEnum,
        weekdays: dbDeliveryScheduleEnum === 'WEEKDAYS' ? JSON.stringify(weekdays) : null,
        qty: parsedQty,
        altQty: parsedAltQty,
        rate: unitPrice, // Store the unit price in the rate field
        totalQty,
        amount,
        walletamt,
        payableamt,
        receivedamt: 0,
        paymentStatus: paymentStatus,
        deliveryInstructions,
      };
      
      // Connect depot product variant if found
      if (typeof depotProductVariantId !== 'undefined' && depotProductVariantId) {
        subscriptionData.depotProductVariant = { connect: { id: depotProductVariantId } };
      }
      
      console.log('[DEBUG] subscriptionData being saved:', JSON.stringify(subscriptionData, null, 2));

      if (parsedDeliveryAddressId) {
        subscriptionData.deliveryAddress = { connect: { id: parsedDeliveryAddressId } };
      }

      const newSubscription = await tx.subscription.create({
        data: subscriptionData,
      });

      // 3. Create a WalletTransaction record if wallet funds were used
      if (walletamt > 0) {
        await tx.walletTransaction.create({
          data: {
            memberId: member.id,
            amount: walletamt,
            type: TransactionType.DEBIT,
            status: TransactionStatus.PAID,
            notes: `Subscription payment for ID: ${newSubscription.id}`,
            referenceNumber: `SUB-${newSubscription.id}`,
            paymentMethod: 'TOPUP',
            processedByAdminId: null,
          },
        });
      }

      // 4. Generate and create DeliveryScheduleEntry records
      // (deliveryScheduleDetails already calculated outside transaction)
      const deliveryScheduleEntries = deliveryScheduleDetails.map(detail => ({
          subscriptionId: newSubscription.id, 
          memberId: member.id,
          deliveryAddressId: parsedDeliveryAddressId,
          productId: parsedProductId,
          deliveryDate: detail.date,
          quantity: detail.quantity,
          status: 'PENDING'
      }));
      
      if (deliveryScheduleEntries.length > 0) {
        await tx.deliveryScheduleEntry.createMany({
            data: deliveryScheduleEntries,
        });
      }
      
      // Fetch the complete order with relations for invoice generation
      const completeOrder = await tx.productOrder.findUnique({
        where: { id: newProductOrder.id },
        include: {
          subscriptions: {
            include: {
              product: true,
              depotProductVariant: true,
              deliveryAddress: true
            }
          },
          member: true
        }
      });

      // Create invoice for the order
      let invoice = null;
      try {
        invoice = await createInvoiceForOrder(completeOrder);
        console.log('Invoice created successfully:', invoice.invoiceNo);
        
        // Update productOrder with invoice details
        if (invoice && invoice.invoiceNo) {
          await tx.productOrder.update({
            where: { id: newProductOrder.id },
            data: {
              invoiceNo: invoice.invoiceNo,
              invoicePath: invoice.pdfPath
            }
          });
        }
      } catch (invoiceError) {
        console.error('Error creating invoice:', invoiceError);
        // Don't fail the subscription creation if invoice fails
      }
      
      return {
        subscription: newSubscription,
        order: newProductOrder,
        invoice: invoice
      };
    });

    res.status(201).json(result);

  } catch (error) {
    console.error('Subscription creation transaction failed:', error);
    // Consider more specific error handling based on Prisma error codes if necessary
    if (error.code === 'P2002' && error.meta && error.meta.target) {
        res.status(409).json({ message: `A subscription with similar details might already exist or there's a conflict on field(s): ${error.meta.target.join(', ')}.`, details: error.message });
    } else if (error.message.includes('foreign key constraint fails')) {
        res.status(400).json({ message: "Invalid reference to another entity (e.g., product, address, or member). Please check IDs.", details: error.message });
    } else {
        res.status(500).json({ message: "Failed to create subscription due to a server error.", details: error.message });
    }
  }
});

// @desc    Get all subscriptions for the current user
// @route   GET /api/subscriptions
// @access  Private
const getSubscriptions = asyncHandler(async (req, res) => {
  let whereClause = {};
  const includeClause = {
    product: true,
    depotProductVariant: {
      select: {
        id: true,
        name: true
      }
    },
    deliveryAddress: true,
    agency: {
      include: {
        user: true,
      },
    },
    member: {
      include: {
        user: true,
      }
    },
    productOrder: {
      select: {
        id: true,
        orderNo: true,
        invoiceNo: true,
        invoicePath: true
      }
    }
  };

  if (req.user.role !== 'ADMIN') {
    const member = await prisma.member.findUnique({
      where: { userId: req.user.id }
    });

    if (!member) {
      res.status(400);
      throw new Error('Member profile not found');
    }
    whereClause = { memberId: member.id };
  }
  // For ADMIN users, whereClause remains empty, fetching all subscriptions.

  const subscriptions = await prisma.subscription.findMany({
    where: whereClause,
    include: includeClause,
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Transform subscriptions to include depot variant unit information
  const transformedSubscriptions = subscriptions.map(subscription => {
    const transformedSubscription = { ...subscription };
    
    // If there's a depot variant, extract unit from its name and add it to the product
    if (subscription.depotProductVariant && subscription.depotProductVariant.name) {
      const variantName = subscription.depotProductVariant.name;
      const extractedUnit = variantName.includes('500ml') ? '500ml' : 
                           variantName.includes('1L') ? '1L' : 
                           variantName.includes('250ml') ? '250ml' : 
                           variantName.includes('2L') ? '2L' : 'unit';
      
      transformedSubscription.product = {
        ...subscription.product,
        depotVariant: {
          id: subscription.depotProductVariant.id,
          name: subscription.depotProductVariant.name,
          unit: extractedUnit
        }
      };
    }
    
    return transformedSubscription;
  });

  res.status(200).json(transformedSubscriptions);
});

// @desc    Get subscription by ID
// @route   GET /api/subscriptions/:id
// @access  Private
const getSubscriptionById = asyncHandler(async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId: req.user.id }
  });

  if (!member) {
    res.status(400);
    throw new Error('Member profile not found');
  }

  const subscription = await prisma.subscription.findUnique({
    where: {
      id: parseInt(req.params.id)
    },
    include: {
      product: true,
      deliveryAddress: true,
      deliveryScheduleEntries: {
        orderBy: {
          deliveryDate: 'asc' // Optional: order entries by date
        }
      },
      productOrder: {
        select: {
          id: true,
          orderNo: true,
          invoiceNo: true,
          invoicePath: true
        }
      }
    }
  });

  if (!subscription) {
    res.status(404);
    throw new Error('Subscription not found');
  }

  // Check if the subscription belongs to the current user
  if (subscription.memberId !== member.id) {
    res.status(403);
    throw new Error('Not authorized to access this subscription');
  }

  res.status(200).json(subscription);
});

// @desc    Update subscription
// @route   PUT /api/subscriptions/:id
// @access  Private
const updateSubscription = asyncHandler(async (req, res) => {
  const subscriptionId = parseInt(req.params.id);

  let member; // Will be populated for non-admins
  if (req.user.role !== 'ADMIN') {
    member = await prisma.member.findUnique({
      where: { userId: req.user.id }
    });

    if (!member) {
      res.status(400);
      throw new Error('Member profile not found for user.'); // Clarified error message
    }
  }

  const subscription = await prisma.subscription.findUnique({
    where: {
      id: parseInt(req.params.id)
    }
  });

  if (!subscription) {
    res.status(404);
    throw new Error('Subscription not found');
  }

  // Authorization: Allow if user is ADMIN, otherwise check ownership
  if (req.user.role !== 'ADMIN') {
    const member = await prisma.member.findUnique({
      where: { userId: req.user.id },
    });
    if (!member) {
      res.status(400); // Or 403 Forbidden
      throw new Error('Member profile not found for user.');
    }
    if (subscription.memberId !== member.id) {
      res.status(403);
      throw new Error('Not authorized to update this subscription');
    }
  }

  const {
    deliveryAddressId,
    qty,
    altQty,
    // deliverySchedule, // Assuming not updated by admin payment/agency modals
    // weekdays,         // Assuming not updated by admin payment/agency modals
    paymentMode,
    paymentReference, // Frontend sends paymentReference, map to paymentReferenceNo if DB is different
    paymentDate,
    paymentStatus,
    agencyId,
    receivedAmount, // <-- Add receivedAmount here
    deliveryInstructions
  } = req.body;
  
  console.log('[DEBUG] updateSubscription - req.body:', req.body);
  console.log('[DEBUG] updateSubscription - deliveryInstructions:', deliveryInstructions);

  const updateData = {
    updatedAt: new Date(),
  };

  // Conditionally add fields to updateData
  if (deliveryInstructions !== undefined) {
    updateData.deliveryInstructions = deliveryInstructions;
    console.log('[DEBUG] updateSubscription - Adding deliveryInstructions to updateData:', deliveryInstructions);
  }
  if (paymentMode !== undefined) updateData.paymentMode = paymentMode;
  if (paymentReference !== undefined) updateData.paymentReferenceNo = paymentReference; // Ensure this matches your Prisma schema field name for payment reference
  if (paymentDate !== undefined) updateData.paymentDate = paymentDate ? new Date(paymentDate) : null;
  if (paymentStatus !== undefined) {
    if (paymentStatus === 'PAID') {
      updateData.paymentStatus = 'PAID';
    } else if (paymentStatus === 'PENDING') {
      updateData.paymentStatus = 'PENDING';
    } else if (paymentStatus === 'FAILED') {
      updateData.paymentStatus = 'FAILED';
    } else {
      // Optional: Handle unknown status, e.g., log a warning or skip update for this field
      console.warn(`Unknown paymentStatus received: ${paymentStatus}`);
      // Or you might want to throw an error or set a default
      // For now, we'll just not set it if it's unrecognized, to prevent Prisma errors.
    }
  }
  if (agencyId !== undefined) {
    if (agencyId === null) {
      updateData.agency = {
        disconnect: true
      };
    } else {
      updateData.agency = {
        connect: { id: Number(agencyId) }
      };
    }
  }
  
  // Include other fields if they are part of the payload and intended for update
  if (qty !== undefined) updateData.qty = qty; // If admin can change qty
  if (altQty !== undefined) updateData.altQty = altQty; // If admin can change altQty

  // Add receivedAmount to updateData if provided
  if (receivedAmount !== undefined && receivedAmount !== null) {
    const parsedReceivedAmount = parseFloat(receivedAmount);
    if (!isNaN(parsedReceivedAmount)) {
      updateData.receivedamt = parsedReceivedAmount;
    } else {
      console.warn(`Invalid receivedAmount value received: ${receivedAmount}`);
      // Optionally, you could throw an error or handle it differently
      // For now, we'll just not update receivedamt if it's not a valid number
    }
  }
  // if (deliverySchedule !== undefined) updateData.deliverySchedule = deliverySchedule;
  // if (weekdays !== undefined) updateData.weekdays = weekdays ? JSON.stringify(weekdays) : undefined;

  if (deliveryAddressId !== undefined) {
    updateData.deliveryAddress = { connect: { id: parseInt(deliveryAddressId) } };
  }

  // IMPORTANT: Recalculation of totalQty and amount needs careful consideration.
  // If qty, altQty, or schedule changes, totalQty and amount should be recalculated.
  // The original logic (lines 451-482) attempted this. If these fields are NOT being
  // updated by the admin payment/agency modals, then totalQty and amount might not need
  // to change, or their update logic needs to be more precise based on what's changing.
  // For now, to avoid incorrect calculations if only payment/agency is updated,
  // we will not include totalQty and amount unless qty/schedule fields are also being explicitly updated.
  // This part requires careful review based on full business requirements for admin updates.

  // Example: If qty is being updated, then fetch product and recalculate amount/totalQty
  if (qty !== undefined /* || other schedule-related fields change */) {
    const product = await prisma.product.findUnique({ where: { id: subscription.productId } });
    if (!product) {
      res.status(404);
      throw new Error('Product associated with subscription not found for rate calculation');
    }
    // rate field removed - product.rate doesn't exist
    // Add robust logic here to recalculate totalQty based on potentially changed qty, altQty, schedule, period
    // For instance, if only qty changes for a DAILY schedule:
    // updateData.totalQty = qty * subscription.period; // Or remaining period if that's the intent
    // updateData.amount = updateData.totalQty * [pricing logic needed];
    // The original logic for daysRemaining and recalculating totalQty was complex and might be needed if schedules change.
    // For now, this is a placeholder if qty changes.
  }

  console.log('[DEBUG] updateSubscription - Final updateData:', JSON.stringify(updateData, null, 2));
  
  const updatedSubscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: updateData,
  });
  
  console.log('[DEBUG] updateSubscription - Updated subscription result:', JSON.stringify(updatedSubscription, null, 2));

  // If agency assignment was updated, also update all related delivery schedule entries
  if (agencyId !== undefined) {
    const deliveryScheduleUpdateData = agencyId === null 
      ? { agentId: null } 
      : { agentId: Number(agencyId) };

    await prisma.deliveryScheduleEntry.updateMany({
      where: {
        subscriptionId: subscriptionId,
        status: { in: ['PENDING', 'NOT_DELIVERED'] } // Only update non-delivered entries
      },
      data: deliveryScheduleUpdateData
    });

    console.log(`Updated delivery schedule entries for subscription ${subscriptionId} with agentId: ${agencyId}`);
  }

  res.status(200).json(updatedSubscription);
});

// @desc    Cancel subscription
// @route   PATCH /api/subscriptions/:id/cancel
// @access  Private
const cancelSubscription = asyncHandler(async (req, res) => {
  let member; // Will be populated for non-admins
  if (req.user.role !== 'ADMIN') {
    member = await prisma.member.findUnique({
      where: { userId: req.user.id }
    });

    if (!member) {
      res.status(400);
      throw new Error('Member profile not found for user.'); // Clarified error message
    }
  }

  const subscription = await prisma.subscription.findUnique({
    where: {
      id: parseInt(req.params.id)
    }
  });

  if (!subscription) {
    res.status(404);
    throw new Error('Subscription not found');
  }

  // Check if the subscription belongs to the current user (if user is not ADMIN)
  if (req.user.role !== 'ADMIN' && subscription.memberId !== member.id) {
    res.status(403);
    throw new Error('Not authorized to cancel this subscription');
  }

  // Check if subscription can be cancelled based on payment status
  const allowedPaymentStatuses = ['PENDING', 'FAILED', 'CANCELLED', null];
  if (!allowedPaymentStatuses.includes(subscription.paymentStatus)) {
    res.status(400);
    throw new Error('Only subscriptions with unpaid, pending, failed, or cancelled payment status can be cancelled');
  }

  // Mark subscription as cancelled without altering expiryDate
  const updatedSubscription = await prisma.subscription.update({
    where: {
      id: parseInt(req.params.id)
    },
    data: {
      paymentStatus: 'CANCELLED',
      updatedAt: new Date()
    }
  });

  // Also cancel any future pending delivery entries for this subscription
  await prisma.deliveryScheduleEntry.updateMany({
    where: {
      subscriptionId: parseInt(req.params.id),
      status: 'PENDING',
      deliveryDate: {
        gte: new Date() // Only future deliveries
      }
    },
    data: {
      status: 'CANCELLED',
      updatedAt: new Date()
    }
  });

  res.status(200).json(updatedSubscription);
});

// @desc    Renew subscription
// @route   POST /api/subscriptions/:id/renew
// @access  Private
const renewSubscription = asyncHandler(async (req, res) => {
  const member = await prisma.member.findUnique({
    where: { userId: req.user.id }
  });

  if (!member) {
    res.status(400);
    throw new Error('Member profile not found');
  }

  const subscription = await prisma.subscription.findUnique({
    where: {
      id: parseInt(req.params.id)
    },
    include: {
      product: true
    }
  });

  if (!subscription) {
    res.status(404);
    throw new Error('Subscription not found');
  }

  // Check if the subscription belongs to the current user
  if (subscription.memberId !== member.id) {
    res.status(403);
    throw new Error('Not authorized to renew this subscription');
  }

  // Calculate new expiry date based on period
  let daysToAdd = 0;
  switch (subscription.period) {
    case 'DAYS_7':
      daysToAdd = 7;
      break;
    case 'DAYS_15':
      daysToAdd = 15;
      break;
    case 'DAYS_30':
      daysToAdd = 30;
      break;
    case 'DAYS_90':
      daysToAdd = 90;
      break;
  }
  
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysToAdd);

  // Create a new subscription record based on the old one with proper relations
  const newSubscription = await prisma.subscription.create({
    data: {
      period: subscription.period,
      expiryDate,
      deliverySchedule: subscription.deliverySchedule,
      weekdays: subscription.weekdays,
      qty: subscription.qty,
      altQty: subscription.altQty,
      // rate field removed - product.rate doesn't exist
      totalQty: subscription.totalQty,
      amount: 0, // TODO: Calculate amount based on actual pricing logic
      paymentMode: subscription.paymentMode,
      paymentReferenceNo: req.body.paymentReferenceNo || null,
      paymentDate: new Date(),
      paymentStatus: 'PAID',
      
      // Connect to existing member
      member: {
        connect: { id: member.id }
      },
      
      // Connect to existing delivery address
      deliveryAddress: {
        connect: { id: subscription.deliveryAddressId }
      },
      
      // Connect to existing product
      product: {
        connect: { id: subscription.productId }
      },
      
      // Connect to agency if needed
      ...(subscription.agencyId ? {
        agency: {
          connect: { id: subscription.agencyId }
        }
      } : {})
    }
  });

  res.status(201).json(newSubscription);
});

// @desc    Get delivery schedule entries by date grouped by agency
// @route   GET /api/subscriptions/delivery-schedule/by-date
// @access  Private (Admin only)
// @desc    Get delivery schedule entries by date grouped by agency
// @route   GET /api/subscriptions/delivery-schedule/by-date
// @access  Private (Admin only)
const getDeliveryScheduleByDate = asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ message: 'Date parameter is required' });
  }

  console.log(`[getDeliveryScheduleByDate] Query date parameter: ${date}`);

  const targetDate = new Date(date); // Expecting YYYY-MM-DD
  if (isNaN(targetDate.getTime())) {
    return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD' });
  }
  console.log(`[getDeliveryScheduleByDate] Parsed target date for query: ${targetDate.toISOString().split('T')[0]}`);

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Only admins can access this endpoint' });
  }

  try {
    const aggregatedEntries = await prisma.deliveryScheduleEntry.groupBy({
      by: ['subscriptionId', 'productId'],
      where: {
        deliveryDate: {
          // For @db.Date, Prisma expects a DateTime object. 
          // new Date(dateString) where dateString is 'YYYY-MM-DD' will be interpreted as UTC midnight.
          // If your local timezone causes issues, ensure 'date' is treated as UTC.
          equals: new Date(date), 
        },
      },
      
      _sum: {
        quantity: true,
      },
    });

    console.log(`[getDeliveryScheduleByDate] Found ${aggregatedEntries.length} (subscription, product) groups.`);

    if (aggregatedEntries.length === 0) {
      return res.status(200).json({ date, agencies: [] });
    }

    const subscriptionIds = [...new Set(aggregatedEntries.map(e => e.subscriptionId))];
    const productIds = [...new Set(aggregatedEntries.map(e => e.productId))];

    // Fetch related data in parallel
    const [subscriptionsData, productsData] = await Promise.all([
      prisma.subscription.findMany({
        where: { id: { in: subscriptionIds } },
        select: {
          id: true,
          agencyId: true,
          agency: { select: { user: { select: { name: true } } } },
        },
      }),
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
      }),
    ]);

    const subscriptionsMap = new Map(subscriptionsData.map(s => [s.id, s]));
    const productsMap = new Map(productsData.map(p => [p.id, p]));

    const agencySummary = aggregatedEntries.reduce((acc, group) => {
      const subscription = subscriptionsMap.get(group.subscriptionId);
      const product = productsMap.get(group.productId);
      const summedQuantity = group._sum.quantity || 0;

      if (!subscription || !product) {
        console.warn(`[getDeliveryScheduleByDate] Missing subscription or product data for group: subscriptionId=${group.subscriptionId}, productId=${group.productId}`);
        return acc; // Skip this group if essential related data is missing
      }

      const agencyId = subscription.agencyId || 'unassigned'; // Handle null agencyId
      const agencyName = subscription.agency?.user?.name || (agencyId === 'unassigned' ? 'Unassigned' : 'Unknown Agency');

      // Initialize agency in accumulator if not present
      acc[agencyId] = acc[agencyId] || {
        agencyId,
        agencyName,
        totalQuantity: 0,
        products: {},
      };

      acc[agencyId].totalQuantity += summedQuantity;

      // Initialize product within agency if not present
      const productKey = product.id;
      acc[agencyId].products[productKey] = acc[agencyId].products[productKey] || {
        product: { connect: { id: product.id } },
        productName: product.name,
        quantity: 0,
      };
      acc[agencyId].products[productKey].quantity += summedQuantity;
      
      return acc;
    }, {});

    const result = Object.values(agencySummary).map(agency => ({
      ...agency,
      products: Object.values(agency.products),
    }));

    res.status(200).json({ date, agencies: result });

  } catch (error) {
    console.error('Error in getDeliveryScheduleByDate:', error);
    res.status(500).json({ message: `Failed to retrieve delivery schedule data: ${error.message}` });
  }
});

const skipMemberDelivery = asyncHandler(async (req, res) => {
  const { deliveryEntryId } = req.params;
  const userId = req.user.id; // Authenticated user's ID

  if (!deliveryEntryId || isNaN(parseInt(deliveryEntryId))) {
    res.status(400);
    throw new Error('Valid Delivery Entry ID is required.');
  }
  const entryId = parseInt(deliveryEntryId);

  // Fetch the delivery entry and essential related data for validation and refund
  const deliveryEntry = await prisma.deliveryScheduleEntry.findUnique({
    where: { id: entryId },
    include: {
      subscription: {
        select: { // Select only necessary fields from subscription
          id: true,
          memberId: true,
          rate: true, // Include rate for refund calculation
          qty: true,
          member: { // To verify ownership via user ID
            select: { 
              userId: true,
              walletBalance: true
            }
          }
        }
      },
      product: { // Include product for basic info
        select: { id: true, name: true } // Only select fields that exist
      }
    },
  });

  if (!deliveryEntry) {
    res.status(404);
    throw new Error('Delivery entry not found.');
  }

  // Authorization check
  if (!deliveryEntry.subscription || !deliveryEntry.subscription.member || deliveryEntry.subscription.member.userId !== userId) {
    res.status(403);
    throw new Error('You are not authorized to modify this delivery entry.');
  }

  // Date validation: Delivery can only be skipped if its date is strictly after today's date.
  const deliveryDateForComparison = startOfDay(deliveryEntry.deliveryDate);
  const today = startOfDay(new Date());
  if (!isAfter(deliveryDateForComparison, today)) {
    res.status(400);
    throw new Error('Deliveries can only be skipped if they are scheduled for a date strictly after today.');
  }

  // Status validation: Only PENDING deliveries can be skipped.
  if (deliveryEntry.status !== 'PENDING') {
    res.status(400);
    throw new Error(`This delivery cannot be skipped. Current status: ${deliveryEntry.status}. Only PENDING deliveries can be skipped.`);
  }

  let updatedDeliveryEntryResult;
  let walletTransaction = null;
  let refundMessage = '';
  let finalMessage = 'Delivery skipped successfully.';

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update Delivery Schedule Entry status to SKIP_BY_CUSTOMER
      updatedDeliveryEntryResult = await tx.deliveryScheduleEntry.update({
        where: { id: entryId },
        data: {
          status: 'SKIP_BY_CUSTOMER', // Use proper status for customer-initiated skip
          updatedAt: new Date(),
        },
        include: { // Keep the include for the response
          product: {
            select: { name: true }
          },
          subscription: {
            select: {
              id: true,
              rate: true,
              memberId: true
            }
          }
        }
      });
      console.log('Updated Delivery Entry in backend:', updatedDeliveryEntryResult);

      // 2. Process Refund - Calculate refund amount and credit to wallet
      const refundAmount = walletService.calculateRefundAmount({
        subscription: { rate: deliveryEntry.subscription.rate },
        quantity: deliveryEntry.quantity
      });
      
      console.log(`Calculated refund amount: ${refundAmount} for delivery entry ${entryId}`);
      
      if (refundAmount > 0) {
        const referenceNumber = `SKIP_DELIVERY_${entryId}`;
        const notes = `Refund for skipped delivery - ${deliveryEntry.product?.name || 'Product'} on ${new Date(deliveryEntry.deliveryDate).toLocaleDateString()}`;
        
        walletTransaction = await walletService.creditWallet(
          deliveryEntry.subscription.memberId,
          refundAmount,
          referenceNumber,
          notes,
          null // No admin ID for member-initiated skip
        );
        
        refundMessage = ` Refund of ₹${refundAmount.toFixed(2)} has been credited to your wallet.`;
        console.log(`Wallet credited successfully for member ${deliveryEntry.subscription.memberId}: ₹${refundAmount}`);
      } else {
        refundMessage = ' No refund applicable for this delivery.';
        console.log('No refund amount calculated for this delivery skip.');
      }
    }); // End of Prisma transaction

    finalMessage += refundMessage;

  } catch (error) {
    console.error(`CRITICAL: Error during skip/refund transaction for deliveryEntryId ${entryId}:`, error);
    // If the transaction fails, Prisma rolls it back.
    // The deliveryEntry might not have been updated, or refund failed.
    // It's important to let the user know something went wrong.
    return res.status(500).json({
      message: 'An error occurred while processing your request. Please try again or contact support.',
      // Optionally, provide more specific error details in a non-production environment
      // error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }

  res.status(200).json({
    message: finalMessage,
    deliveryEntry: updatedDeliveryEntryResult, // Send the updated entry from the transaction
  });
});

// @desc    Bulk assign agency to multiple subscriptions
// @route   POST /api/subscriptions/bulk-assign-agency
// @access  Private (Admin only)
const bulkAssignAgency = asyncHandler(async (req, res) => {
  // Check if user is admin
  if (req.user.role !== 'ADMIN') {
    res.status(403);
    throw new Error('Only admins can perform bulk agency assignments');
  }

  const { subscriptionIds, agencyId } = req.body;

  // Validate input
  if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
    res.status(400);
    throw new Error('subscriptionIds must be a non-empty array');
  }

  if (agencyId !== null && (!Number.isInteger(agencyId) || agencyId <= 0)) {
    res.status(400);
    throw new Error('agencyId must be a positive integer or null');
  }

  // Validate that all subscriptionIds are integers
  const invalidIds = subscriptionIds.filter(id => !Number.isInteger(id) || id <= 0);
  if (invalidIds.length > 0) {
    res.status(400);
    throw new Error(`Invalid subscription IDs: ${invalidIds.join(', ')}`);
  }

  // Check if agency exists (if agencyId is not null)
  if (agencyId !== null) {
    const agency = await prisma.agency.findUnique({
      where: { id: agencyId }
    });

    if (!agency) {
      res.status(404);
      throw new Error(`Agency with ID ${agencyId} not found`);
    }
  }

  try {
    // Perform bulk update within a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update all subscriptions
      const updateData = agencyId === null 
        ? { agencyId: null }
        : { agencyId: agencyId };

      const updatedSubscriptions = await tx.subscription.updateMany({
        where: {
          id: { in: subscriptionIds },
        },
        data: updateData,
      });

      // Update all related delivery schedule entries (only non-delivered entries)
      const deliveryScheduleUpdateData = agencyId === null 
        ? { agentId: null } 
        : { agentId: agencyId };

      const updatedDeliveryEntries = await tx.deliveryScheduleEntry.updateMany({
        where: {
          subscriptionId: { in: subscriptionIds },
          status: { in: ['PENDING', 'NOT_DELIVERED'] } // Only update non-delivered entries
        },
        data: deliveryScheduleUpdateData
      });

      return {
        subscriptionsUpdated: updatedSubscriptions.count,
        deliveryEntriesUpdated: updatedDeliveryEntries.count
      };
    });

    console.log(`Bulk assignment completed: ${result.subscriptionsUpdated} subscriptions and ${result.deliveryEntriesUpdated} delivery entries updated with agencyId: ${agencyId}`);

    const message = agencyId === null 
      ? `Successfully removed agency assignment from ${result.subscriptionsUpdated} subscription(s)`
      : `Successfully assigned agency to ${result.subscriptionsUpdated} subscription(s)`;

    res.status(200).json({
      message,
      updatedCount: result.subscriptionsUpdated,
      deliveryEntriesUpdated: result.deliveryEntriesUpdated
    });

  } catch (error) {
    console.error('Bulk agency assignment failed:', error);
    res.status(500);
    throw new Error('Failed to perform bulk agency assignment. Please try again.');
  }
});

module.exports = {
  createSubscription,
  getSubscriptions,
  getSubscriptionById,
  updateSubscription,
  cancelSubscription,
  renewSubscription,
  getDeliveryScheduleByDate,
  skipMemberDelivery,
  bulkAssignAgency
};
