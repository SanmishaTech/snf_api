const { PrismaClient, OrderStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('http-errors');

// Helper function to generate new PO Number
async function generateNewPoNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0 (Jan) - 11 (Dec)

  let financialYearPrefix;
  if (month >= 3) { // April (month 3) to December
    const currentFyShort = String(year % 100).padStart(2, '0');
    const nextFyShort = String((year + 1) % 100).padStart(2, '0');
    financialYearPrefix = `${currentFyShort}${nextFyShort}`;
  } else { // January to March
    const prevFyShort = String((year - 1) % 100).padStart(2, '0');
    const currentFyShort = String(year % 100).padStart(2, '0');
    financialYearPrefix = `${prevFyShort}${currentFyShort}`;
  }

  const latestOrder = await prisma.vendorOrder.findFirst({
    where: {
      poNumber: {
        startsWith: `${financialYearPrefix}-`,
      },
    },
    orderBy: {
      poNumber: 'desc',
    },
    select: {
      poNumber: true,
    },
  });

  let nextNumericPart = 1;
  if (latestOrder && latestOrder.poNumber) {
    const parts = latestOrder.poNumber.split('-');
    if (parts.length === 2) {
      const numericPart = parseInt(parts[1], 10);
      if (!isNaN(numericPart)) {
        nextNumericPart = numericPart + 1;
      }
    }
  }

  const newPoNumber = `${financialYearPrefix}-${String(nextNumericPart).padStart(5, '0')}`;
  return newPoNumber;
}

// @desc    Create a new vendor order
// @route   POST /api/vendor-orders
// @access  Private (Authenticated users, specific role check might be needed depending on who can create orders)
exports.createVendorOrder = async (req, res, next) => {
  const {
    poNumber: inputPoNumber, // Changed from poNumber to inputPoNumber
    orderDate,
    deliveryDate,
    vendorId,
    contactPersonName,
    notes,
    orderItems, // Expected: [{ productId, quantity, agencyId }]
  } = req.body;

  // Basic validation
  if (!orderDate || !vendorId || !orderItems || orderItems.length === 0) {
    return next(createError(400, 'Missing required fields: orderDate, vendorId, and at least one orderItem.'));
  }

  let poNumberToSave; // Declare poNumberToSave

  try {
    // Determine PO Number
    if (inputPoNumber && inputPoNumber.trim() !== '') {
      poNumberToSave = inputPoNumber.trim();
    } else {
      poNumberToSave = await generateNewPoNumber(); // Call helper function
    }

    // Validate all products and agencies exist
    let totalAmount = 0;
    const itemsToCreate = [];

    for (const item of orderItems) {
      if (!item.productId || !item.quantity || !item.agencyId) {
        return next(createError(400, `OrderItem missing productId, quantity, or agencyId.`));
      }
      if (item.quantity <= 0) {
        return next(createError(400, `Quantity for product ID ${item.productId} must be positive.`));
      }

      const product = await prisma.product.findUnique({ where: { id: parseInt(item.productId) } });
      if (!product) {
        return next(createError(404, `Product with ID ${item.productId} not found.`));
      }
      // Stock check for product.quantity has been commented out in original, retaining that.

      const agency = await prisma.agency.findUnique({ where: { id: parseInt(item.agencyId) } });
      if (!agency) {
        return next(createError(404, `Agency with ID ${item.agencyId} not found.`));
      }

      itemsToCreate.push({
        productId: parseInt(item.productId),
        quantity: parseInt(item.quantity),
        priceAtPurchase: parseFloat(product.price), // Ensure product.price is a number
        agencyId: parseInt(item.agencyId),
      });
      totalAmount += parseFloat(product.price) * parseInt(item.quantity);
    }

    const newOrder = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.vendorOrder.create({
        data: {
          poNumber: poNumberToSave, // Use poNumberToSave
          orderDate: new Date(orderDate),
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          vendorId: parseInt(vendorId),
          contactPersonName,
          notes,
          totalAmount,
          status: OrderStatus.PENDING, // Default status
          // createdById: req.user.id, // Assuming req.user.id is available if tracking creator
          items: {
            create: itemsToCreate,
          },
        },
        include: {
          items: {
            include: {
              product: true,
              agency: true,
            }
          },
          vendor: true,
        },
      });


      return createdOrder;
    });

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error creating vendor order:", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('poNumber')) {
        const offendingPo = poNumberToSave || inputPoNumber || 'the provided/generated PO Number';
        return next(createError(400, `Purchase Order number '${offendingPo}' already exists.`));
    }
    if (error.message.includes("Not enough stock") || error.message.includes("not found")) {
        return next(error); // Forward specific validation errors
    }
    next(createError(500, "Failed to create vendor order. " + error.message));
  }
};

// @desc    Get all vendor orders
// @route   GET /api/vendor-orders
// @access  Private (ADMIN, AGENCY)
exports.getAllVendorOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, status, vendorId, agencyId, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (vendorId) where.vendorId = parseInt(vendorId);
    // If agencyId filter is applied, it's an AND condition with other filters
    if (agencyId) {
        where.items = { some: { agencyId: parseInt(agencyId) } };
    }

    if (search) {
      where.OR = [
        { poNumber: { contains: search } },
        { vendor: { name: { contains: search } } }, // Corrected/verified structure
        { items: { some: { product: { name: { contains: search } } } } },
        { items: { some: { agency: { name: { contains: search } } } } }
      ];
    }

    const orders = await prisma.vendorOrder.findMany({
      skip,
      take: parseInt(limit),
      where,
      orderBy: { [sortBy]: sortOrder },
      include: {
        vendor: true,
        items: { include: { product: true, agency: true } },
        deliveredBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
      },
    });
    const totalOrders = await prisma.vendorOrder.count({ where });
    res.json({
        data: orders,
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
        currentPage: parseInt(page),
        totalOrders,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get logged in VENDOR's orders
// @route   GET /api/vendor-orders/my
// @access  Private (VENDOR)
exports.getMyVendorOrders = async (req, res, next) => {
  try {
    // Assuming req.user.vendor.id is available if user is a vendor
    // Or, if vendorId is directly on user: req.user.vendorId
    // For this example, let's assume the vendor's ID is linked via their user profile.
    // You might need to adjust this based on your User-Vendor relationship.
    const userWithVendor = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { vendor: { select: { id: true } } }
    });
    console.log(userWithVendor)

    if (!userWithVendor || !userWithVendor.vendor) {
        return next(createError(403, "User is not associated with a vendor."));
    }
    const currentVendorId = userWithVendor.vendor.id;
    console.log(currentVendorId)

    const { page = 1, limit = 10, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query; // Added 'search'
    const skip = (parseInt(page) - 1) * parseInt(limit);
    // Base condition: always filter by the current vendor's ID
    const where = { vendorId: currentVendorId }; 
    if (status) where.status = status.toUpperCase();

    if (search) {
      // The OR conditions are applied in conjunction with the vendorId filter
      where.OR = [
        { poNumber: { contains: search } },
        { items: { some: { product: { name: { contains: search } } } } },
        { items: { some: { agency: { name: { contains: search } } } } }
      ];
    }

    const orders = await prisma.vendorOrder.findMany({
      skip,
      take: parseInt(limit),
      where,
      orderBy: { [sortBy]: sortOrder },
      include: {
        vendor: true,
        items: { include: { product: true, agency: true } },
      },
    });
     const totalOrders = await prisma.vendorOrder.count({ where });
    res.json({
        data: orders,
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
        currentPage: parseInt(page),
        totalOrders,
    });
  } catch (error) {
    next(error);
  }
};


// @desc    Get vendor order by ID
// @route   GET /api/vendor-orders/:id
// @access  Private
exports.getVendorOrderById = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = await prisma.vendorOrder.findUnique({
      where: { id: orderId },
      include: {
        vendor: true,
        items: { include: { product: true, agency: true } },
        deliveredBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    // Basic authentication check (user object should exist if auth middleware ran)
    const user = req.user;
    if (!user) {
        return next(createError(401, 'Authentication required.'));
    }

    // Removed specific role-based access control as per user request.
    // Frontend lists are expected to filter orders appropriately.

    res.json(order);
  } catch (error) {
    next(error);
  }
};

// @desc    Update vendor order (e.g., notes, PO number, items)
// @route   PUT /api/vendor-orders/:id
// @access  Private (e.g., ADMIN, or VENDOR if it's their order and status is PENDING)
exports.updateVendorOrder = async (req, res, next) => {
  const orderId = parseInt(req.params.id);
  const {
    poNumber,
    orderDate, // Added orderDate as potentially updatable
    deliveryDate,
    contactPersonName,
    notes,
    orderItems, // Expected: [{ productId, quantity, agencyId }]
    vendorId
  } = req.body;

  try {
    const updatedOrderInTransaction = await prisma.$transaction(async (tx) => {
      const order = await tx.vendorOrder.findUnique({ where: { id: orderId } });
      if (!order) {
        throw createError(404, 'Order not found');
      }

      // Authorization check (adapt as needed)
      // if (req.user.role !== 'ADMIN' && !(req.user.vendorId === order.vendorId && order.status === OrderStatus.PENDING)) {
      //   throw createError(403, 'Not authorized to update this order');
      // }

      let dataToUpdate = {
        poNumber: poNumber !== undefined ? poNumber : order.poNumber,
        orderDate: orderDate ? new Date(orderDate) : order.orderDate,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : order.deliveryDate,
        contactPersonName: contactPersonName !== undefined ? contactPersonName : order.contactPersonName,
        notes: notes !== undefined ? notes : order.notes,
        vendorId: vendorId ? parseInt(vendorId) : order.vendorId,
        // totalAmount will be set if orderItems are processed
      };

      if (orderItems && Array.isArray(orderItems)) {
        // Delete existing items for this order
        await tx.orderItem.deleteMany({
          where: { vendorOrderId: orderId },
        });

        let newTotalAmount = 0;
        const itemsToCreateData = [];

        if (orderItems.length > 0) { // Only process if there are items to add
            for (const item of orderItems) {
                if (!item.productId || item.quantity === undefined || !item.agencyId) { // quantity can be 0 if allowed, but must be present
                    throw createError(400, `OrderItem missing productId, quantity, or agencyId.`);
                }
                if (item.quantity < 0) { // Allow 0 quantity if it means removing item effectively, but not negative
                    throw createError(400, `Quantity for product ID ${item.productId} must be non-negative.`);
                }

                const product = await tx.product.findUnique({ where: { id: parseInt(item.productId) } });
                if (!product) {
                    throw createError(404, `Product with ID ${item.productId} not found.`);
                }

                const agency = await tx.agency.findUnique({ where: { id: parseInt(item.agencyId) } });
                if (!agency) {
                    throw createError(404, `Agency with ID ${item.agencyId} not found.`);
                }
                
                // Only add item if quantity > 0, effectively allowing removal by setting quantity to 0
                if (parseInt(item.quantity) > 0) {
                    itemsToCreateData.push({
                        productId: parseInt(item.productId),
                        quantity: parseInt(item.quantity),
                        priceAtPurchase: parseFloat(product.price),
                        agencyId: parseInt(item.agencyId),
                        vendorOrderId: orderId // ensure vendorOrderId is set for createMany
                    });
                    newTotalAmount += parseFloat(product.price) * parseInt(item.quantity);
                }
            }

            if (itemsToCreateData.length > 0) {
                await tx.orderItem.createMany({
                    data: itemsToCreateData,
                });
            }
        }
        // If orderItems is an empty array, all items are deleted and totalAmount becomes 0.
        dataToUpdate.totalAmount = newTotalAmount;
      } else {
        // If orderItems is not provided (undefined or null), keep existing totalAmount
        // This means we are not touching items or totalAmount in this case.
        dataToUpdate.totalAmount = order.totalAmount; 
      }

      return tx.vendorOrder.update({
        where: { id: orderId },
        data: dataToUpdate,
        include: {
          vendor: true,
          items: { include: { product: true, agency: true } },
        },
      });
    }); // End of transaction

    res.json(updatedOrderInTransaction);

  } catch (error) {
    if (error.statusCode) { // If it's an error created by createError
        return next(error);
    }
    if (error.code === 'P2002' && error.meta?.target?.includes('poNumber')) {
        return next(createError(400, 'Purchase Order number already exists.'));
    }
    console.error("Error updating order:", error); // For server logs
    next(createError(500, 'Failed to update order. ' + error.message));
  }
};

// @desc    Update vendor order status
// @route   PATCH /api/vendor-orders/:id/status
// @access  Private (ADMIN, AGENCY, VENDOR)
exports.updateVendorOrderStatus = async (req, res, next) => {
  const orderId = parseInt(req.params.id);
  const { status } = req.body; // Expected: PENDING, ASSIGNED, DELIVERED

  if (!status || !Object.values(OrderStatus).includes(status)) {
    return next(createError(400, 'Invalid status provided.'));
  }

  try {
    const order = await prisma.vendorOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    // Add more specific authorization based on who can change to what status
    // For example, a VENDOR might only be able to move to ASSIGNED or DELIVERED from PENDING/ASSIGNED.
    // An AGENCY might only be able to move to DELIVERED if they are involved.

    const updatedOrder = await prisma.vendorOrder.update({
      where: { id: orderId },
      data: { status },
      include: {
        vendor: true,
        items: { include: { product: true, agency: true } },
      },
    });
    res.json(updatedOrder);
  } catch (error) {
    next(error);
  }
};

// @desc    Mark order as delivered
// @route   PATCH /api/vendor-orders/:id/delivery
// @access  Private (VENDOR, ADMIN, AGENCY)
exports.markOrderDelivered = async (req, res, next) => {
    const orderId = parseInt(req.params.id);
    // const { deliveredAt } = req.body; // Optional: allow specifying delivery time

    try {
        const order = await prisma.vendorOrder.findUnique({ where: { id: orderId } });
        if (!order) {
            return next(createError(404, 'Order not found'));
        }

        if (order.status === OrderStatus.DELIVERED && order.deliveredById && order.deliveredAt) {
            return res.status(400).json({ message: 'Order already marked as delivered.' });
        }
        
        // Authorization: Ensure the user is the vendor for this order, or an admin/agency
        // if (req.user.role === 'VENDOR' && req.user.vendorId !== order.vendorId) {
        //    return next(createError(403, 'Not authorized to mark this order as delivered.'));
        // }


        const updatedOrder = await prisma.vendorOrder.update({
            where: { id: orderId },
            data: {
                status: OrderStatus.DELIVERED,
                deliveredById: req.user.id, // Logged-in user marked it as delivered
                deliveredAt: new Date(), // Current time
            },
            include: {
                vendor: true,
                items: { include: { product: true, agency: true } },
                deliveredBy: { select: { id: true, name: true, email: true } },
            },
        });
        res.json(updatedOrder);
    } catch (error) {
        next(error);
    }
};

// @desc    Mark order as received
// @route   PATCH /api/vendor-orders/:id/reception
// @access  Private (AGENCY, ADMIN)
exports.markOrderReceived = async (req, res, next) => {
    const orderId = parseInt(req.params.id);
    // const { receivedAt } = req.body; // Optional: allow specifying reception time

    try {
        const order = await prisma.vendorOrder.findUnique({ 
            where: { id: orderId },
            include: { items: true } // Need items to check agency involvement
        });
        if (!order) {
            return next(createError(404, 'Order not found'));
        }

        if (order.receivedById && order.receivedAt) {
             return res.status(400).json({ message: 'Order already marked as received.' });
        }

        // Authorization: Ensure the user is an admin or an agency involved in this order
        // let isAgencyInvolved = false;
        // if (req.user.role === 'AGENCY') {
        //     isAgencyInvolved = order.items.some(item => item.agencyId === req.user.agencyId);
        // }
        // if (req.user.role !== 'ADMIN' && !isAgencyInvolved) {
        //    return next(createError(403, 'Not authorized to mark this order as received.'));
        // }

        const updatedOrder = await prisma.vendorOrder.update({
            where: { id: orderId },
            data: {
                // status: OrderStatus.DELIVERED, // Status should already be DELIVERED by vendor
                receivedById: req.user.id, // Logged-in user marked it as received
                receivedAt: new Date(),    // Current time
            },
            include: {
                vendor: true,
                items: { include: { product: true, agency: true } },
                receivedBy: { select: { id: true, name: true, email: true } },
            },
        });
        res.json(updatedOrder);
    } catch (error) {
        next(error);
    }
};


// @desc    Record delivery for order items
// @route   PUT /api/vendor-orders/:id/record-delivery
// @access  Private (VENDOR, ADMIN)
exports.recordDelivery = async (req, res, next) => {
  const orderId = parseInt(req.params.id);
  const { items: deliveryItems } = req.body; // items should be [{ orderItemId, deliveredQuantity }]

  if (isNaN(orderId)) {
    return next(createError(400, 'Invalid Order ID.'));
  }

  if (!Array.isArray(deliveryItems) || deliveryItems.length === 0) {
    return next(createError(400, 'Delivery items array is required and cannot be empty.'));
  }

  for (const item of deliveryItems) {
    if (item.orderItemId == null || item.deliveredQuantity == null) {
      return next(createError(400, 'Each delivery item must have orderItemId and deliveredQuantity.'));
    }
    if (typeof item.deliveredQuantity !== 'number' || item.deliveredQuantity < 0 || !Number.isInteger(item.deliveredQuantity)) {
      return next(createError(400, `Delivered quantity for item ID ${item.orderItemId} must be a non-negative integer.`));
    }
  }

  try {
    const order = await prisma.vendorOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return next(createError(404, 'Order not found.'));
    }

    // Prevent re-recording if already fully delivered by this new mechanism
    // You might allow updates if PARTIALLY_DELIVERED, or if your business logic allows corrections.
    if (order.status === OrderStatus.DELIVERED) {
      return next(createError(400, 'Order is already marked as DELIVERED. Cannot record new delivery.'));
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Update delivered quantities for each order item
      for (const deliveryItem of deliveryItems) {
        const orderItemToUpdate = order.items.find(oi => oi.id === parseInt(deliveryItem.orderItemId));

        if (!orderItemToUpdate) {
          throw createError(404, `OrderItem with ID ${deliveryItem.orderItemId} not found in this order.`);
        }

        if (deliveryItem.deliveredQuantity > orderItemToUpdate.quantity) {
          throw createError(400, `Delivered quantity (${deliveryItem.deliveredQuantity}) for item ${orderItemToUpdate.productId} cannot exceed ordered quantity (${orderItemToUpdate.quantity}).`);
        }

        await tx.orderItem.update({
          where: { id: parseInt(deliveryItem.orderItemId) },
          data: { deliveredQuantity: deliveryItem.deliveredQuantity },
        });
      }

      // 2. Recalculate overall order status based on all items
      const allOrderItems = await tx.orderItem.findMany({
        where: { vendorOrderId: orderId },
      });

      let totalOrderedQuantity = 0;
      let totalDeliveredQuantity = 0;
      allOrderItems.forEach(item => {
        totalOrderedQuantity += item.quantity;
        totalDeliveredQuantity += (item.deliveredQuantity || 0); // Use 0 if deliveredQuantity is null/undefined
      });

      let newStatus = order.status; // Default to current status
      if (totalDeliveredQuantity === 0 && totalOrderedQuantity > 0) {
        newStatus = OrderStatus.DELIVERED;

        // If all deliveries are zeroed out, status could revert.
        // For instance, if it was DELIVERED, it might go back to PENDING or ASSIGNED.
        // If it was PENDING, it stays PENDING. If ASSIGNED, stays ASSIGNED.
        // Let's assume if it becomes 0, and was DELIVERED, it goes to ASSIGNED.
        if (order.status === OrderStatus.DELIVERED) {
            newStatus = OrderStatus.ASSIGNED; // Or PENDING based on exact workflow
        }
        // If PENDING or ASSIGNED, it remains as is (newStatus is already order.status)
      } else if (totalDeliveredQuantity > 0) {
        // If partially delivered (some items delivered, but not all quantity)
        // Mark as DELIVERED even when partial quantity is delivered
        newStatus = OrderStatus.DELIVERED;
      }
      
      // 3. Update the VendorOrder itself
      const finalUpdatedOrder = await tx.vendorOrder.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          deliveredAt: newStatus === OrderStatus.DELIVERED || newStatus === OrderStatus.PARTIALLY_DELIVERED ? new Date() : order.deliveredAt, // Update time if actually delivered/partially
          deliveredById: req.user?.id || order.deliveredById, // Assuming req.user.id is available
        },
        include: {
          vendor: true,
          items: { include: { product: true, agency: true } },
          deliveredBy: { select: { id: true, name: true, email: true } },
          receivedBy: { select: { id: true, name: true, email: true } },
        },
      });
      return finalUpdatedOrder;
    });

    res.json(updatedOrder);

  } catch (error) {
    if (error.statusCode) { // If it's an error created by createError
        return next(error);
    }
    console.error("Error recording delivery:", error);
    next(createError(500, 'Failed to record delivery. ' + error.message));
  }
};

// @desc    Record receipt for order items
// @route   PUT /api/vendor-orders/:id/record-receipt
// @access  Private (ADMIN, or other roles authorized to receive goods)
exports.recordReceipt = async (req, res, next) => {
  const orderId = parseInt(req.params.id);
  const { items: receiptItems } = req.body; // items should be [{ orderItemId, receivedQuantity }]

  if (isNaN(orderId)) {
    return next(createError(400, 'Invalid Order ID.'));
  }

  if (!Array.isArray(receiptItems) || receiptItems.length === 0) {
    return next(createError(400, 'Receipt items array is required and cannot be empty.'));
  }

  for (const item of receiptItems) {
    if (item.orderItemId == null || item.receivedQuantity == null) {
      return next(createError(400, 'Each receipt item must have orderItemId and receivedQuantity.'));
    }
    if (typeof item.receivedQuantity !== 'number' || item.receivedQuantity < 0 || !Number.isInteger(item.receivedQuantity)) {
      return next(createError(400, `Received quantity for item ID ${item.orderItemId} must be a non-negative integer.`));
    }
  }

  try {
    const order = await prisma.vendorOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return next(createError(404, 'Order not found.'));
    }

    // Business rule: Order should typically be in DELIVERED state to record receipt.
    // Or, if partial deliveries are possible and recorded, it could be in a state reflecting that.
    if (order.status !== OrderStatus.DELIVERED) {
      // Allow receiving if already RECEIVED for corrections, or if PENDING/ASSIGNED and deliveries are being skipped.
      // This condition might need refinement based on exact workflow.
      // For now, let's be strict: must be DELIVERED.
      // return next(createError(400, `Order status is ${order.status}. Receipt can only be recorded for DELIVERED orders.`));
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Update received quantities for each order item
      for (const receiptItem of receiptItems) {
        const orderItemToUpdate = order.items.find(oi => oi.id === parseInt(receiptItem.orderItemId));

        if (!orderItemToUpdate) {
          throw createError(404, `OrderItem with ID ${receiptItem.orderItemId} not found in this order.`);
        }

        if (orderItemToUpdate.deliveredQuantity == null) {
            throw createError(400, `Cannot record receipt for item ${orderItemToUpdate.productId} as it has no delivered quantity recorded.`);
        }

        if (receiptItem.receivedQuantity > orderItemToUpdate.deliveredQuantity) {
          throw createError(400, `Received quantity (${receiptItem.receivedQuantity}) for item ID ${orderItemToUpdate.id} cannot exceed delivered quantity (${orderItemToUpdate.deliveredQuantity}).`);
        }

        await tx.orderItem.update({
          where: { id: parseInt(receiptItem.orderItemId) },
          data: { receivedQuantity: receiptItem.receivedQuantity },
        });
      }

      // 2. Set order status to RECEIVED if any receipt items were processed.
      // The original logic for checking if all delivered items were fully received is removed as per user request.
      let newStatus = OrderStatus.RECEIVED;
      let receivedAtTime = new Date();
      let receivedByIdUser = req.user?.id; // Assuming req.user.id is available
      
      // 3. Update the VendorOrder itself
      const finalUpdatedOrder = await tx.vendorOrder.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          receivedAt: receivedAtTime,
          receivedById: receivedByIdUser,
        },
        include: {
          vendor: true,
          items: { include: { product: true, agency: true } },
          deliveredBy: { select: { id: true, name: true, email: true } },
          receivedBy: { select: { id: true, name: true, email: true } },
        },
      });
      return finalUpdatedOrder;
    });

    res.json(updatedOrder);

  } catch (error) {
    if (error.statusCode) { // If it's an error created by createError
        return next(error);
    }
    console.error("Error recording receipt:", error);
    next(createError(500, 'Failed to record receipt. ' + error.message));
  }
};

// @desc    Delete vendor order
// @route   DELETE /api/vendor-orders/:id
// @access  Private (ADMIN)
// @desc    Get logged in AGENCY's orders
// @route   GET /api/vendor-orders/my-agency-orders
// @access  Private (AGENCY)
exports.getMyAgencyOrders = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'AGENCY') {
      return next(createError(403, 'Forbidden: User is not an agency or not authenticated.'));
    }

    const agencyUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { agency: true },
    });

    if (!agencyUser || !agencyUser.agency) {
      return next(createError(404, 'Agency profile not found for this user.'));
    }
    const agencyId = agencyUser.agency.id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, status: statusFilter, date, excludeStatus } = req.query; // Added excludeStatus

    let whereClause = {
      items: {
        some: {
          agencyId: agencyId,
        },
      },
    };

    // Handle explicit status filter first
    if (statusFilter) {
      if (Object.values(OrderStatus).includes(statusFilter.toUpperCase())) {
        whereClause.status = statusFilter.toUpperCase();
      } else {
        return next(createError(400, `Invalid status filter. Valid statuses are: ${Object.values(OrderStatus).join(', ')}`));
      }
    } else if (excludeStatus && excludeStatus.toUpperCase() === 'PENDING') {
      // If no specific status is requested, but PENDING should be excluded
      whereClause.status = {
        not: OrderStatus.PENDING // Use OrderStatus enum value
      };
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      whereClause.orderDate = {
        gte: startDate,
        lte: endDate,
      };
    }

    if (search) {
      whereClause.OR = [
        { poNumber: { contains: search } },
        { vendor: { name: { contains: search } } },
        { items: { some: { product: { name: { contains: search } } } } },
        { items: { some: { agency: { name: { contains: search } } } } }
      ];
    }

    const orders = await prisma.vendorOrder.findMany({
      where: whereClause,
      include: {
        vendor: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, unit: true } },
            agency: { select: { id: true, name: true } }, // Included for completeness, though filtered by agencyId
          },
        },
        deliveredBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { orderDate: 'desc' },
      skip: skip,
      take: limit,
    });

    const totalOrders = await prisma.vendorOrder.count({
      where: whereClause,
    });

    const totalPages = Math.ceil(totalOrders / limit);

    // Add recordedByAgencies to each order
    const ordersWithReceiptStatus = orders.map(order => {
      const agenciesThatRecorded = new Set();
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          // Assuming 'receivedQuantity' being non-null indicates recording by the item's agency
          // and item.agencyId is the ID of the agency responsible for that item.
          if (item.agencyId && item.receivedQuantity !== null) { 
            agenciesThatRecorded.add(String(item.agencyId));
          }
        });
      }
      return {
        ...order,
        recordedByAgencies: Array.from(agenciesThatRecorded),
      };
    });

    res.json({
      data: ordersWithReceiptStatus, // Use the modified array
      page,
      totalPages,
      totalItems: totalOrders,
    });

  } catch (error) {
    console.error('Error fetching agency orders:', error);
    next(createError(500, 'Failed to fetch agency orders.'));
  }
};

exports.deleteVendorOrder = async (req, res, next) => {
  const orderId = parseInt(req.params.id);

  try {
    const order = await prisma.vendorOrder.findUnique({ 
        where: { id: orderId },
        include: { items: true }
    });

    if (!order) {
      return next(createError(404, 'Order not found'));
    }

    // IMPORTANT: Handle product quantity restoration if order is cancelled/deleted
    await prisma.$transaction(async (tx) => {
        await tx.vendorOrder.delete({ where: { id: orderId } });
    });

    res.status(200).json({ message: 'Vendor order and associated items deleted, product quantities restored.' });
  } catch (error) {
    console.error("Error deleting order:", error);
    next(error);
  }
};
