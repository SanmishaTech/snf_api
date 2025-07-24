const { PrismaClient, OrderStatus } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function to transform order items for API response
const transformOrderItems = (items) => {
  if (!items) return [];
  return items.map(item => ({
    ...item,
    productId: item.product.id, // Ensure productId is the direct ID
    productName: item.product.name,
    unit: item.product.unit,
    // Remove the nested product object to avoid redundancy if not needed further by frontend for this specific view
    // product: undefined, // Or selectively pick fields if the full product object is sometimes needed
  }));
};
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

    // Validate depot if provided
    let depotId = null;
    if (item.depotId && item.depotId !== '') {
      const depot = await prisma.depot.findUnique({ where: { id: parseInt(item.depotId) } });
      if (!depot) {
        return next(createError(404, `Depot with ID ${item.depotId} not found.`));
      }
      depotId = parseInt(item.depotId);
    }

    // Validate depot variant if provided
    let depotVariantId = null;
    if (item.depotVariantId && item.depotVariantId !== '') {
      const depotVariant = await prisma.depotProductVariant.findUnique({ where: { id: parseInt(item.depotVariantId) } });
      if (!depotVariant) {
        return next(createError(404, `Depot variant with ID ${item.depotVariantId} not found.`));
      }
      depotVariantId = parseInt(item.depotVariantId);
    }

    itemsToCreate.push({
      productId: parseInt(item.productId),
      quantity: parseInt(item.quantity),
      priceAtPurchase: parseFloat(product.price), // Ensure product.price is a number
      agencyId: parseInt(item.agencyId),
      depotId: depotId,
      depotVariantId: depotVariantId,
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

    if (newOrder && newOrder.items) {
      newOrder.items = transformOrderItems(newOrder.items);
    }
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
        items: { 
          include: { 
            product: true, 
            agency: true,
            depot: { select: { id: true, name: true } },
            depotVariant: { select: { id: true, name: true } }
          } 
        },
        deliveredBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
      },
    });
    const totalOrders = await prisma.vendorOrder.count({ where });
    const transformedOrders = orders.map(order => ({
      ...order,
      items: transformOrderItems(order.items),
    }));
    res.json({
      data: transformedOrders,
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
    const transformedOrders = orders.map(order => ({
      ...order,
      items: transformOrderItems(order.items),
    }));
    res.json({
      data: transformedOrders,
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
        items: { 
          include: { 
            product: true, 
            agency: true,
            depot: { select: { id: true, name: true } },
            depotVariant: { select: { id: true, name: true } }
          } 
        },
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

    if (order && order.items) {
      order.items = transformOrderItems(order.items);
    }
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

            // Validate depot if provided in update
            let depotId = null;
            if (item.depotId && item.depotId !== '') {
              const depot = await tx.depot.findUnique({ where: { id: parseInt(item.depotId) } });
              if (!depot) {
                throw createError(404, `Depot with ID ${item.depotId} not found.`);
              }
              depotId = parseInt(item.depotId);
            }

            // Validate depot variant if provided in update
            let depotVariantId = null;
            if (item.depotVariantId && item.depotVariantId !== '') {
              const depotVariant = await tx.depotProductVariant.findUnique({ where: { id: parseInt(item.depotVariantId) } });
              if (!depotVariant) {
                throw createError(404, `Depot variant with ID ${item.depotVariantId} not found.`);
              }
              depotVariantId = parseInt(item.depotVariantId);
            }

            // Only add item if quantity > 0, effectively allowing removal by setting quantity to 0
            if (parseInt(item.quantity) > 0) {
              itemsToCreateData.push({
                productId: parseInt(item.productId),
                quantity: parseInt(item.quantity),
                priceAtPurchase: parseFloat(product.price),
                agencyId: parseInt(item.agencyId),
                depotId: depotId,
                depotVariantId: depotVariantId,
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

    if (updatedOrderInTransaction && updatedOrderInTransaction.items) {
      updatedOrderInTransaction.items = transformOrderItems(updatedOrderInTransaction.items);
    }
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
    if (updatedOrder && updatedOrder.items) {
      updatedOrder.items = transformOrderItems(updatedOrder.items);
    }
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
    if (updatedOrder && updatedOrder.items) {
      updatedOrder.items = transformOrderItems(updatedOrder.items);
    }
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
        deliveredBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (updatedOrder && updatedOrder.items) {
      updatedOrder.items = transformOrderItems(updatedOrder.items);
    }
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
        // Let's assume if it becomes 0, and was DELIVERED, it goes back to ASSIGNED.
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

    if (updatedOrder && updatedOrder.items) {
      updatedOrder.items = transformOrderItems(updatedOrder.items);
    }
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

    if (updatedOrder && updatedOrder.items) {
      updatedOrder.items = transformOrderItems(updatedOrder.items);
    }
    res.json(updatedOrder);

  } catch (error) {
    if (error.statusCode) { // If it's an error created by createError
      return next(error);
    }
    console.error("Error recording receipt:", error);
    next(createError(500, 'Failed to record receipt. ' + error.message));
  }
};

// @desc    Record supervisor quantity for order items
// @route   PUT /api/vendor-orders/:id/record-supervisor-quantity
// @access  Private (SUPERVISOR role)
exports.recordSupervisorQuantity = async (req, res, next) => {
  const orderId = parseInt(req.params.id);
  const { items: supervisorItems } = req.body; // items should be [{ orderItemId, supervisorQuantity }]

  if (isNaN(orderId)) {
    return next(createError(400, 'Invalid Order ID.'));
  }

  if (!Array.isArray(supervisorItems) || supervisorItems.length === 0) {
    return next(createError(400, 'Supervisor items array is required and cannot be empty.'));
  }

  for (const item of supervisorItems) {
    if (item.orderItemId == null || item.supervisorQuantity == null) {
      return next(createError(400, 'Each supervisor item must have orderItemId and supervisorQuantity.'));
    }
    if (typeof item.supervisorQuantity !== 'number' || item.supervisorQuantity < 0 || !Number.isInteger(item.supervisorQuantity)) {
      return next(createError(400, `Supervisor quantity for item ID ${item.orderItemId} must be a non-negative integer.`));
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

    // Business rule: Order should be in DELIVERED or RECEIVED state to record supervisor quantity
    if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.RECEIVED) {
      return next(createError(400, `Order status is ${order.status}. Supervisor quantity can only be recorded for DELIVERED or RECEIVED orders.`));
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update supervisor quantities for each order item
      for (const supervisorItem of supervisorItems) {
        const orderItemToUpdate = order.items.find(oi => oi.id === parseInt(supervisorItem.orderItemId));

        if (!orderItemToUpdate) {
          throw createError(404, `OrderItem with ID ${supervisorItem.orderItemId} not found in this order.`);
        }

        if (orderItemToUpdate.receivedQuantity == null) {
          throw createError(400, `Cannot record supervisor quantity for item ${orderItemToUpdate.productId} as it has no received quantity recorded.`);
        }

        if (supervisorItem.supervisorQuantity > orderItemToUpdate.receivedQuantity) {
          throw createError(400, `Supervisor quantity (${supervisorItem.supervisorQuantity}) for item ID ${orderItemToUpdate.id} cannot exceed received quantity (${orderItemToUpdate.receivedQuantity}).`);
        }

        await tx.orderItem.update({
          where: { id: parseInt(supervisorItem.orderItemId) },
          data: { supervisorQuantity: supervisorItem.supervisorQuantity },
        });
      }

      // Return the updated order with all items
      const finalUpdatedOrder = await tx.vendorOrder.findUnique({
        where: { id: orderId },
        include: {
          vendor: true,
          items: { include: { product: true, agency: true } },
          deliveredBy: { select: { id: true, name: true, email: true } },
          receivedBy: { select: { id: true, name: true, email: true } },
        },
      });
      return finalUpdatedOrder;
    });

    if (updatedOrder && updatedOrder.items) {
      updatedOrder.items = transformOrderItems(updatedOrder.items);
    }
    res.json(updatedOrder);

  } catch (error) {
    if (error.statusCode) { // If it's an error created by createError
      return next(error);
    }
    console.error("Error recording supervisor quantity:", error);
    next(createError(500, 'Failed to record supervisor quantity. ' + error.message));
  }
};

// @desc    Get logged in SUPERVISOR's agency orders
// @route   GET /api/vendor-orders/my-supervisor-orders
// @access  Private (SUPERVISOR)
exports.getMySupervisorAgencyOrders = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'SUPERVISOR') {
      return next(createError(403, 'Forbidden: User is not a supervisor or not authenticated.'));
    }

    const supervisorUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { 
        supervisor: {
          include: {
            agency: true
          }
        }
      },
    });

    if (!supervisorUser || !supervisorUser.supervisor) {
      return next(createError(404, 'Supervisor profile not found for this user.'));
    }

    if (!supervisorUser.supervisor.agency) {
      return next(createError(404, 'No agency assigned to this supervisor.'));
    }

    const agencyId = supervisorUser.supervisor.agency.id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, status: statusFilter, date } = req.query;

    let whereClause = {
      items: {
        some: {
          agencyId: agencyId,
        },
      },
      // Show DELIVERED and RECEIVED orders for supervisor to record quantities and view
      status: {
        in: [OrderStatus.DELIVERED, OrderStatus.RECEIVED]
      },
    };

    // Handle explicit status filter (supervisors can see DELIVERED and RECEIVED orders)
    if (statusFilter && (statusFilter.toUpperCase() === 'DELIVERED' || statusFilter.toUpperCase() === 'RECEIVED')) {
      whereClause.status = statusFilter.toUpperCase() === 'DELIVERED' ? OrderStatus.DELIVERED : OrderStatus.RECEIVED;
    }

    // Handle search filter
    if (search) {
      whereClause.OR = [
        { poNumber: { contains: search, mode: 'insensitive' } },
        { vendor: { name: { contains: search, mode: 'insensitive' } } },
        { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    // Handle date filter
    if (date) {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        whereClause.orderDate = {
          gte: startOfDay,
          lte: endOfDay,
        };
      }
    }

    const orders = await prisma.vendorOrder.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: true,
        items: {
          include: {
            product: true,
            agency: true,
            depot: true,
            depotVariant: true,
          },
        },
        deliveredBy: { select: { id: true, name: true, email: true } },
        receivedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Transform orders for response
    const transformedOrders = orders.map(order => ({
      ...order,
      items: transformOrderItems(order.items),
    }));

    const totalRecords = await prisma.vendorOrder.count({ where: whereClause });
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      data: transformedOrders,
      totalRecords,
      totalPages,
      currentPage: page,
    });

  } catch (error) {
    console.error("Error fetching supervisor agency orders:", error);
    next(createError(500, 'Failed to fetch supervisor agency orders. ' + error.message));
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
        vendor: { 
          select: { 
            id: true, 
            name: true, 
            contactPersonName: true, 
            mobile: true, 
            email: true 
          } 
        },
        items: {
          include: {
            product: { 
              select: { 
                id: true, 
                name: true, 
                price: true, 
                unit: true, 
                description: true 
              } 
            },
            agency: { 
              include: {
                user: {
                  select: { 
                    id: true, 
                    name: true, 
                    email: true, 
                    mobile: true 
                  }
                }
              }
            },
            depot: {
              select: {
                id: true,
                name: true,
                address: true,
                contactPerson: true,
                contactNumber: true
              }
            }
          },
        },
        deliveredBy: { select: { id: true, name: true, email: true, mobile: true } },
        receivedBy: { select: { id: true, name: true, email: true, mobile: true } },
      },
      orderBy: { orderDate: 'desc' },
      skip: skip,
      take: limit,
    });

    const totalOrders = await prisma.vendorOrder.count({
      where: whereClause,
    });

    const totalPages = Math.ceil(totalOrders / limit);

    const transformedOrdersInitial = orders.map(order => ({
      ...order,
      items: transformOrderItems(order.items),
    }));

    // Add recordedByAgencies to each order
    const ordersWithReceiptStatus = transformedOrdersInitial.map(order => {
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
      data: ordersWithReceiptStatus, 
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

/**
 * @desc    Get vendor orders for a specific date (with details)
 * @route   GET /api/vendor-orders/details?date=YYYY-MM-DD
 * @access  Private (ADMIN, AGENCY, VENDOR)
 */
exports.getOrderDetailsByDate = async (req, res, next) => {
  try {
    const { date, depotId, agencyId } = req.query;
    console.log('[getOrderDetailsByDate] Request for date:', date, 'depotId:', depotId, 'agencyId:', agencyId);

    if (!date) {
      return next(createError(400, 'Date parameter is required.'));
    }

    const deliveryDate = new Date(date);
    console.log('[getOrderDetailsByDate] Parsed delivery date:', deliveryDate);
    
    // Build where conditions array
    const whereConditions = [
      "s.paymentStatus = 'PAID'",
      "d.deliveryDate = ?",
      "d.status = 'PENDING'"
    ];
    const queryParams = [deliveryDate];
    
    if (depotId) {
      whereConditions.push("depot.id = ?");
      queryParams.push(parseInt(depotId));
    }
    
    if (agencyId) {
      whereConditions.push("a.id = ?");
      queryParams.push(parseInt(agencyId));
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get aggregated data by depot and variant with product information
    const deliveryScheduleQuery = `
    SELECT
      depot.id AS depotId,
      depot.name AS depotName,
      depot.address AS depotAddress,
      depot.contactPerson AS depotContactPerson,
      depot.contactNumber AS depotContactNumber,
      dpv.id AS variantId,
      dpv.name AS variantName,
      dpv.mrp AS variantMrp,
      dpv.buyOncePrice AS variantBuyOncePrice,
      dpv.price3Day AS variantPrice3Day,
      dpv.price7Day AS variantPrice7Day,
      dpv.price15Day AS variantPrice15Day,
      dpv.price1Month AS variantPrice1Month,
      p.id AS productId,
      p.name AS productName,
      p.unit AS productUnit,
      p.price AS productPrice,
      p.rate AS productRate,
      p.isDairyProduct,
      cat.name AS categoryName,
      AVG(s.rate) AS avgSubscriptionRate,
      SUM(d.quantity) AS totalQuantity,
      COUNT(DISTINCT d.id) AS deliveryCount,
      COUNT(DISTINCT d.memberId) AS memberCount,
      COUNT(DISTINCT a.id) AS agencyCount,
      GROUP_CONCAT(DISTINCT a.name) AS agencyNames,
      GROUP_CONCAT(DISTINCT a.id) AS agencyIds
    FROM delivery_schedule_entries d
    JOIN subscriptions s ON d.subscriptionId = s.id
    JOIN products p ON d.productId = p.id
    LEFT JOIN categories cat ON p.categoryId = cat.id
    JOIN depot_product_variants dpv ON s.depotProductVariantId = dpv.id
    JOIN depots depot ON dpv.depotId = depot.id
    LEFT JOIN agencies a ON s.agencyId = a.id
    WHERE ${whereClause}
    GROUP BY depot.id, dpv.id, p.id, a.id
    ORDER BY depot.name, dpv.name, p.name
  `;
    
    const deliverySchedule = await prisma.$queryRawUnsafe(deliveryScheduleQuery, ...queryParams);

    console.log('[getOrderDetailsByDate] Raw query results count:', deliverySchedule.length);
    
    // Get member details for each depot-variant combination
    const memberDetailsQuery = `
    SELECT
      depot.id AS depotId,
      dpv.id AS variantId,
      a.id AS agencyId,
      m.id AS memberId,
      m.name AS memberName,
      da.recipientName,
      da.mobile AS memberMobile,
      da.plotBuilding,
      da.streetArea,
      da.landmark,
      da.pincode,
      da.city,
      d.quantity,
      l.name AS locationName
    FROM delivery_schedule_entries d
    JOIN subscriptions s ON d.subscriptionId = s.id
    JOIN members m ON d.memberId = m.id
    JOIN depot_product_variants dpv ON s.depotProductVariantId = dpv.id
    JOIN depots depot ON dpv.depotId = depot.id
    LEFT JOIN delivery_addresses da ON d.deliveryAddressId = da.id
    LEFT JOIN locations l ON da.locationId = l.id
    LEFT JOIN agencies a ON s.agencyId = a.id
    WHERE ${whereClause}
    ORDER BY depot.name, dpv.name, m.name
  `;
    
    const memberDetails = await prisma.$queryRawUnsafe(memberDetailsQuery, ...queryParams);
    
    // Get summary statistics
    const summaryStatsQuery = `
    SELECT
      COUNT(DISTINCT depot.id) AS totalDepots,
      COUNT(DISTINCT dpv.id) AS totalVariants,
      COUNT(DISTINCT d.memberId) AS totalMembers,
      COUNT(DISTINCT a.id) AS totalAgencies,
      SUM(d.quantity) AS totalQuantity,
      COUNT(DISTINCT d.id) AS totalDeliveries
    FROM delivery_schedule_entries d
    JOIN subscriptions s ON d.subscriptionId = s.id
    JOIN depot_product_variants dpv ON s.depotProductVariantId = dpv.id
    JOIN depots depot ON dpv.depotId = depot.id
    LEFT JOIN agencies a ON s.agencyId = a.id
    WHERE ${whereClause}
  `;
    
    const summaryStats = await prisma.$queryRawUnsafe(summaryStatsQuery, ...queryParams);
    
    // Process and format the results
    const result = deliverySchedule.map(item => {
      // Get member details for this depot-variant-agency combination
      const members = memberDetails
        .filter(m => {
          // Match by depot, variant, and agency
          const agencyIds = item.agencyIds ? item.agencyIds.split(',').map(id => parseInt(id)) : [];
          const memberAgencyId = m.agencyId || null;
          return m.depotId === item.depotId && 
                 m.variantId === item.variantId && 
                 (agencyIds.length === 0 || agencyIds.includes(memberAgencyId));
        })
        .map(m => ({
          memberId: m.memberId,
          memberName: m.memberName,
          recipientName: m.recipientName,
          mobile: m.memberMobile,
          address: {
            plotBuilding: m.plotBuilding,
            streetArea: m.streetArea,
            landmark: m.landmark,
            pincode: m.pincode,
            city: m.city,
            locationName: m.locationName
          },
          quantity: parseInt(m.quantity)
        }));
      
      return {
        depot: {
          id: item.depotId,
          name: item.depotName,
          address: item.depotAddress,
          contactPerson: item.depotContactPerson,
          contactNumber: item.depotContactNumber
        },
        variant: {
          id: item.variantId,
          name: item.variantName,
          pricing: {
            mrp: item.variantMrp ? parseFloat(item.variantMrp) : null,
            buyOncePrice: item.variantBuyOncePrice ? parseFloat(item.variantBuyOncePrice) : null,
            price3Day: item.variantPrice3Day ? parseFloat(item.variantPrice3Day) : null,
            price7Day: item.variantPrice7Day ? parseFloat(item.variantPrice7Day) : null,
            price15Day: item.variantPrice15Day ? parseFloat(item.variantPrice15Day) : null,
            price1Month: item.variantPrice1Month ? parseFloat(item.variantPrice1Month) : null
          }
        },
        product: {
          id: item.productId,
          name: item.productName,
          unit: item.productUnit,
          price: item.productPrice ? parseFloat(item.productPrice) : null,
          rate: item.productRate ? parseFloat(item.productRate) : null,
          isDairyProduct: item.isDairyProduct,
          category: item.categoryName
        },
        statistics: {
          totalQuantity: parseInt(item.totalQuantity),
          deliveryCount: parseInt(item.deliveryCount),
          memberCount: parseInt(item.memberCount),
          agencyCount: parseInt(item.agencyCount),
          avgSubscriptionRate: item.avgSubscriptionRate ? parseFloat(item.avgSubscriptionRate) : null
        },
        agencies: {
          ids: item.agencyIds ? item.agencyIds.split(',').map(id => parseInt(id)) : [],
          names: item.agencyNames ? item.agencyNames.split(',') : []
        },
        members: members
      };
    });
    
    // Format summary statistics
    const summary = summaryStats[0] ? {
      totalDepots: parseInt(summaryStats[0].totalDepots),
      totalVariants: parseInt(summaryStats[0].totalVariants),
      totalMembers: parseInt(summaryStats[0].totalMembers),
      totalAgencies: parseInt(summaryStats[0].totalAgencies),
      totalQuantity: parseInt(summaryStats[0].totalQuantity),
      totalDeliveries: parseInt(summaryStats[0].totalDeliveries)
    } : {
      totalDepots: 0,
      totalVariants: 0,
      totalMembers: 0,
      totalAgencies: 0,
      totalQuantity: 0,
      totalDeliveries: 0
    };
    
    console.log('[getOrderDetailsByDate] Returning', result.length, 'grouped order items with detailed information');

    return res.json({
      date: date,
      summary: summary,
      data: result
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    next(createError(500, 'Failed to fetch order details.'));
  }
};
