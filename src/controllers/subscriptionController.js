const asyncHandler = require('express-async-handler');
const { PrismaClient } = require('@prisma/client');
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
      currentQuantity = (i % 2 === 0) ? qty : altQty;
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
    deliverySchedule: rawDeliverySchedule, // Renamed to map to backend format
    weekdays, // This should be an array like ["mon", "tue"]
    qty,
    altQty,
    startDate // Add startDate here
    // paymentMode, paymentReferenceNo removed
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

  // Get current user's member ID
  const member = await prisma.member.findUnique({
    where: { userId: req.user.id }
  });

  if (!member) {
    res.status(400);
    throw new Error('Member profile not found');
  }

  // Parse IDs and validate they are actual numbers
  console.log('Raw product ID:', productId, 'type:', typeof productId);
  console.log('Raw delivery address ID from req.body:', req.body.deliveryAddressId, 'type:', typeof req.body.deliveryAddressId); // More specific logging
  console.log('Raw startDate from req.body:', req.body.startDate, 'type:', typeof req.body.startDate);
  
  let parsedProductId;
  let parsedDeliveryAddressId;
  
  try {
    parsedProductId = Number(productId);
    parsedDeliveryAddressId = Number(deliveryAddressId);
  } catch (e) {
    console.error('Error parsing IDs:', e);
    res.status(400);
    throw new Error(`Error parsing IDs: ${e.message}`);
  }
  
  // Validate IDs
  if (isNaN(parsedProductId)) {
    res.status(400);
    throw new Error('Invalid product ID');
  }
  
  if (isNaN(parsedDeliveryAddressId)) {
    res.status(400);
    throw new Error('Invalid delivery address ID: ' + deliveryAddressId);
  }
  
  // Get product details for price calculation
  const product = await prisma.product.findUnique({
    where: { id: parsedProductId }
  });

  if (!product) {
    // Explicitly return a 404 response
    return res.status(404).json({ message: 'Product not found' }); 
  }

  // Calculate expiry date based on period
  // Use startDate from request if provided and valid, otherwise use current date
  let baseDate = new Date(); // Default to now
  if (startDate) {
    const parsedStartDate = new Date(startDate);
    if (!isNaN(parsedStartDate.getTime())) {
      baseDate = parsedStartDate;
      console.log('Using provided startDate for expiry calculation:', baseDate);
    } else {
      console.warn('Invalid startDate received, defaulting to current date for expiry calculation.');
    }
  } else {
    console.log('No startDate provided, using current date for expiry calculation.');
  }

  let expiryDate = new Date(baseDate);
  
  // Frontend now sends 'period' as a number of days.
  if (typeof period === 'number' && period > 0) {
    expiryDate.setDate(expiryDate.getDate() + period - 1);
  } else {
    console.error(`Invalid period value: ${period}. Must be a positive number.`);
    return res.status(400).json({ message: 'Invalid subscription period provided. Must be a positive number of days.' });
  }

  console.log('Calculated expiryDate:', expiryDate);

  // Calculate total quantity and amount
  let totalQty = 0;
  
  if (deliverySchedule === 'DAILY') {
    totalQty = qty * period;
  } else if (deliverySchedule === 'ALTERNATE_DAYS') {
    // For alternate days, quantity is delivered roughly every other day.
    // If altQty is provided, it means qty on day 1, altQty on day 3, qty on day 5 etc.
    // If no altQty, then qty on day 1, qty on day 3 etc.
    const primaryDeliveries = Math.ceil(period / 2);
    const secondaryDeliveries = Math.floor(period / 2);
    if (altQty) {
      totalQty = (primaryDeliveries * qty) + (secondaryDeliveries * altQty);
    } else {
      totalQty = primaryDeliveries * qty; // Or simply qty * period / 2 if it's always the same qty
                                        // Assuming 'qty' is for the days it IS delivered.
    }
  } else if (deliverySchedule === 'VARYING') {
    if (altQty && typeof altQty === 'number' && altQty > 0) {
      const primaryDeliveries = Math.ceil(period / 2);
      const secondaryDeliveries = Math.floor(period / 2);
      totalQty = (primaryDeliveries * qty) + (secondaryDeliveries * altQty);
    } else {
      // If no valid altQty, assume 'qty' is delivered daily for the 'varying' period
      totalQty = qty * period;
    }
  } else if ((deliverySchedule === 'SELECT_DAYS' || deliverySchedule === 'SELECT-DAYS') && Array.isArray(weekdays) && weekdays.length > 0) {
    console.log('[SELECT_DAYS] Processing with weekdays:', weekdays);
    const selectedWeekdays = weekdays.map(day => day.toLowerCase()); // Ensure consistent casing, e.g., ["mon", "tue"]
    let count = 0;
    for (let i = 0; i < period; i++) {
      const currentDate = new Date(baseDate); // Use baseDate consistent with expiryDate calculation
      currentDate.setDate(currentDate.getDate() + i);
      // Get day index (0 for Sunday, 1 for Monday, etc.) and convert to our day key format
      const dayIndex = currentDate.getDay();
      const dayKey = getDayKey(dayIndex);
      console.log(`[SELECT_DAYS] Day ${i}: ${currentDate.toISOString().split('T')[0]}, dayKey: ${dayKey}, selected: ${selectedWeekdays.includes(dayKey)}`);
      if (selectedWeekdays.includes(dayKey)) {
        count++;
      }
    }
    totalQty = count * qty;
    console.log(`[SELECT_DAYS] Total delivery days: ${count}, totalQty: ${totalQty}`);
  } else if (deliverySchedule === 'WEEKDAYS') { // Handle cases where weekdays might be empty or not an array for WEEKDAYS schedule
    totalQty = 0; // Default to 0 if no valid weekdays are provided for WEEKDAYS schedule
  }

  const amount = totalQty * product.rate;

  // Create subscription with proper relationsf
  // Map deliverySchedule to Prisma enum values
  console.log(`[SubscriptionController] Mapping to Prisma Enum: deliverySchedule is '${deliverySchedule}' (type: ${typeof deliverySchedule})`);
  let prismaDeliveryScheduleEnum;
  const effectiveDeliverySchedule = typeof deliverySchedule === 'string' ? deliverySchedule.trim() : deliverySchedule;

  if (effectiveDeliverySchedule === 'SELECT_DAYS') {
    prismaDeliveryScheduleEnum = 'WEEKDAYS';
  } else if (effectiveDeliverySchedule === 'DAILY') {
    prismaDeliveryScheduleEnum = 'DAILY';
  } else if (effectiveDeliverySchedule === 'ALTERNATE_DAYS') {
    prismaDeliveryScheduleEnum = 'ALTERNATE_DAYS';
  } else if (effectiveDeliverySchedule === 'VARYING') {
    // VARYING needs to be mapped to DAILY or ALTERNATE_DAYS for Prisma enum
    const hasValidAltQty = altQty && typeof altQty === 'number' && altQty > 0;
    prismaDeliveryScheduleEnum = hasValidAltQty ? 'ALTERNATE_DAYS' : 'DAILY';
    console.log(`[SubscriptionController] Mapped VARYING to ${prismaDeliveryScheduleEnum} for Prisma (altQty: ${altQty}, valid: ${hasValidAltQty}).`);
  } else {
    // Fallback for unexpected values or if deliverySchedule was not a string initially.
    console.warn(`[SubscriptionController] Unexpected/unhandled effectiveDeliverySchedule value '${effectiveDeliverySchedule}' (original: '${deliverySchedule}') received. Attempting to use as is for Prisma.`);
    prismaDeliveryScheduleEnum = effectiveDeliverySchedule; // This will likely error if not a valid Prisma enum member.
  }

  const subscription = await prisma.subscription.create({
    data: {
      period,
      expiryDate,
      startDate: baseDate, // Added startDate from baseDate
      deliverySchedule: prismaDeliveryScheduleEnum, // Use mapped value
      weekdays: (Array.isArray(weekdays) && weekdays.length > 0) ? JSON.stringify(weekdays) : null,
      qty,
      altQty, // Prisma handles undefined as optional field not set
      rate: product.rate, // Ensure 'product' is fetched and contains 'rate'
      totalQty,
      amount,
      member: {
        connect: { id: member.id }, // Ensure 'memberId' is correctly defined (e.g., req.user.id)
      },
      deliveryAddress: {
        connect: { id: parsedDeliveryAddressId }, // Ensure 'deliveryAddressId' is from req.body
      },
      product: {
        connect: { id: parsedProductId } // Ensure 'productId' is from req.body
      }
    }
  });

  if (subscription) {
    // Generate and store delivery schedule
    // const isValidAltQty = altQty && typeof altQty === 'number' && altQty > 0; // This logic is now inside generateDeliveryDates
    const deliveryScheduleDetails = generateDeliveryDates(
      baseDate,         // Effective start date
      period,           // Duration in days
      deliverySchedule, // Logical schedule type: 'DAILY', 'ALTERNATE_DAYS', 'SELECT_DAYS', 'VARYING'
      qty,              // Primary quantity from req.body
      altQty,           // Alternate quantity from req.body (can be undefined)
      weekdays          // Array like ["mon", "tue"] for SELECT_DAYS
    );

    if (deliveryScheduleDetails.length > 0) {
      const deliveryScheduleEntries = deliveryScheduleDetails.map(detail => ({
        subscriptionId: subscription.id,
        memberId: member.id, // Ensure member.id is correctly sourced
        deliveryAddressId: parsedDeliveryAddressId,
        productId: parsedProductId,
        deliveryDate: detail.date,
        quantity: detail.quantity, // Set the quantity for this specific delivery
        status: 'PENDING',       // Default status for new schedule entries
      }));

      try {
        await prisma.deliveryScheduleEntry.createMany({
          data: deliveryScheduleEntries,
        });
        console.log(`Successfully created ${deliveryScheduleEntries.length} delivery schedule entries for subscription ${subscription.id}`);
      } catch (error) {
        console.error(`Error creating delivery schedule entries for subscription ${subscription.id}:`, error);
        // Depending on business logic, you might want to handle this error more explicitly,
        // e.g., by setting a flag on the subscription or notifying an admin.
        // For now, the subscription creation will still be considered successful.
      }
    }
    res.status(201).json(subscription);
  } else {
    // This case should ideally not be reached if prisma.subscription.create throws on failure.
    res.status(500).json({ message: "Subscription creation failed, delivery schedule not generated." });
  }
});

// @desc    Get all subscriptions for the current user
// @route   GET /api/subscriptions
// @access  Private
const getSubscriptions = asyncHandler(async (req, res) => {
  let whereClause = {};
  const includeClause = {
    product: true,
    deliveryAddress: true,
    agency: {
      include: {
        user: true,
      },
    },
    member: {
      include: {
        user: true,
      },
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

  res.status(200).json(subscriptions);
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
      deliveryAddress: true
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
    agencyId
  } = req.body;

  const updateData = {
    updatedAt: new Date(),
  };

  // Conditionally add fields to updateData
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
    updateData.rate = product.rate;
    // Add robust logic here to recalculate totalQty based on potentially changed qty, altQty, schedule, period
    // For instance, if only qty changes for a DAILY schedule:
    // updateData.totalQty = qty * subscription.period; // Or remaining period if that's the intent
    // updateData.amount = updateData.totalQty * product.rate;
    // The original logic for daysRemaining and recalculating totalQty was complex and might be needed if schedules change.
    // For now, this is a placeholder if qty changes.
  }

  const updatedSubscription = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: updateData,
  });

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

  // Set expiry date to now to effectively cancel the subscription
  const updatedSubscription = await prisma.subscription.update({
    where: {
      id: parseInt(req.params.id)
    },
    data: {
      expiryDate: new Date(),
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
      rate: subscription.product.rate, // Use current product rate
      totalQty: subscription.totalQty,
      amount: subscription.totalQty * subscription.product.rate,
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
        productId: product.id,
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

module.exports = {
  createSubscription,
  getSubscriptions,
  getSubscriptionById,
  updateSubscription,
  cancelSubscription,
  renewSubscription,
  getDeliveryScheduleByDate
};
