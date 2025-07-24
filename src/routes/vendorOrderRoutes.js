const express = require('express');

/**
 * @swagger
 * components:
 *   schemas:
 *     SimpleUser:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: User ID.
 *         name:
 *           type: string
 *           description: User's full name.
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address.
 * 
 *     SimpleVendor:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Vendor ID.
 *         name:
 *           type: string
 *           description: Vendor's name.
 *
 *     SimpleAgency:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Agency ID.
 *         name:
 *           type: string
 *           description: Agency's name.
 *
 *     OrderItemBase:
 *       type: object
 *       required:
 *         - productId
 *         - quantity
 *         - agencyId
 *       properties:
 *         productId:
 *           type: integer
 *           description: ID of the product.
 *         quantity:
 *           type: integer
 *           description: Quantity of the product.
 *           minimum: 1
 *         agencyId:
 *           type: integer
 *           description: ID of the agency for this item.
 * 
 *     OrderItemResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated ID of the order item.
 *         productId:
 *           type: integer
 *           description: ID of the product.
 *         productName:
 *           type: string
 *           description: Name of the product.
 *         unit:
 *           type: string
 *           nullable: true
 *           description: Unit of the product (e.g., kg, piece).
 *         quantity:
 *           type: integer
 *           description: Ordered quantity.
 *         priceAtPurchase:
 *           type: number
 *           format: float
 *           description: Price of the product at the time of purchase.
 *         agencyId:
 *           type: integer
 *           description: ID of the agency associated with this item.
 *         agency:
 *           $ref: '#/components/schemas/SimpleAgency'
 *         deliveredQuantity:
 *           type: integer
 *           nullable: true
 *           description: Quantity delivered for this item.
 *         receivedQuantity:
 *           type: integer
 *           nullable: true
 *           description: Quantity received for this item.
 *         supervisorQuantity:
 *           type: integer
 *           nullable: true
 *           description: Quantity verified by supervisor for this item.
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     NewVendorOrderRequest:
 *       type: object
 *       required:
 *         - orderDate
 *         - vendorId
 *         - orderItems
 *       properties:
 *         poNumber:
 *           type: string
 *           description: Purchase Order number. If not provided, it will be auto-generated.
 *         orderDate:
 *           type: string
 *           format: date
 *           description: Date of the order (YYYY-MM-DD).
 *         deliveryDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Expected delivery date (YYYY-MM-DD).
 *         vendorId:
 *           type: integer
 *           description: ID of the vendor.
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: Name of the contact person for this order.
 *         notes:
 *           type: string
 *           nullable: true
 *           description: Any notes for the order.
 *         orderItems:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItemBase'
 *           minItems: 1
 *           description: List of items in the order.
 *
 *     UpdateVendorOrderRequest:
 *       type: object
 *       properties:
 *         poNumber:
 *           type: string
 *           description: Purchase Order number.
 *         orderDate:
 *           type: string
 *           format: date
 *           description: Date of the order (YYYY-MM-DD).
 *         deliveryDate:
 *           type: string
 *           format: date
 *           nullable: true
 *           description: Expected delivery date (YYYY-MM-DD).
 *         vendorId:
 *           type: integer
 *           description: ID of the vendor. Cannot be changed if order already has items.
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: Name of the contact person for this order.
 *         notes:
 *           type: string
 *           nullable: true
 *           description: Any notes for the order.
 *         orderItems:
 *           type: array
 *           items:
 *             allOf:
 *               - $ref: '#/components/schemas/OrderItemBase'
 *               - type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: ID of the existing order item to update. Omit for new items.
 *           description: List of items. Existing items not in this list may be removed. New items are added. Matched items are updated.
 *
 *     VendorOrderResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         poNumber:
 *           type: string
 *         orderDate:
 *           type: string
 *           format: date-time
 *         deliveryDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         vendorId:
 *           type: integer
 *         vendor:
 *           $ref: '#/components/schemas/SimpleVendor'
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *         notes:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [PENDING, ASSIGNED, DELIVERED, RECEIVED, CANCELLED]
 *         deliveredById:
 *           type: integer
 *           nullable: true
 *         deliveredBy:
 *           $ref: '#/components/schemas/SimpleUser'
 *           nullable: true
 *         deliveredAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         deliveryNotes:
 *           type: string
 *           nullable: true
 *         receivedById:
 *           type: integer
 *           nullable: true
 *         receivedBy:
 *           $ref: '#/components/schemas/SimpleUser'
 *           nullable: true
 *         receivedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         receptionNotes:
 *           type: string
 *           nullable: true
 *         totalAmount:
 *           type: number
 *           format: float
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItemResponse'
 *
 *     VendorOrderListResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VendorOrderResponse'
 *         totalRecords:
 *           type: integer
 *         totalPages:
 *           type: integer
 *         currentPage:
 *           type: integer
 *
 *     StatusUpdateRequest:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [PENDING, ASSIGNED, DELIVERED, RECEIVED, CANCELLED]
 *           description: The new status for the order.
 *
 *     DeliveryNotesRequest:
 *       type: object
 *       properties:
 *         deliveryNotes:
 *           type: string
 *           nullable: true
 *           description: Notes related to the delivery.
 *
 *     ReceptionNotesRequest:
 *       type: object
 *       properties:
 *         receptionNotes:
 *           type: string
 *           nullable: true
 *           description: Notes related to the reception of goods.
 *
 *     RecordDeliveryItem:
 *       type: object
 *       required:
 *         - orderItemId
 *         - deliveredQuantity
 *       properties:
 *         orderItemId:
 *           type: integer
 *           description: ID of the order item.
 *         deliveredQuantity:
 *           type: integer
 *           minimum: 0
 *           description: Quantity delivered for this item.
 *
 *     RecordDeliveryRequest:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RecordDeliveryItem'
 *           minItems: 1
 *
 *     RecordReceiptItem:
 *       type: object
 *       required:
 *         - orderItemId
 *         - receivedQuantity
 *       properties:
 *         orderItemId:
 *           type: integer
 *           description: ID of the order item.
 *         receivedQuantity:
 *           type: integer
 *           minimum: 0
 *           description: Quantity received for this item.
 *
 *     RecordReceiptRequest:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RecordReceiptItem'
 *           minItems: 1
 *
 *     RecordSupervisorQuantityItem:
 *       type: object
 *       required:
 *         - orderItemId
 *         - supervisorQuantity
 *       properties:
 *         orderItemId:
 *           type: integer
 *           description: ID of the order item.
 *         supervisorQuantity:
 *           type: integer
 *           minimum: 0
 *           description: Quantity verified by supervisor for this item.
 *
 *     RecordSupervisorQuantityRequest:
 *       type: object
 *       required:
 *         - items
 *       properties:
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/RecordSupervisorQuantityItem'
 *           minItems: 1
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 * tags:
 *   name: Vendor Orders
 *   description: API for managing vendor purchase orders
 */
const router = express.Router();
const vendorOrderController = require('../controllers/vendorOrderController');
const auth = require('../middleware/auth');
const createError = require('http-errors'); // Added for error handling in custom middleware

// Middleware to check if user is ADMIN or AGENCY
const isAdminOrAgency = (req, res, next) => {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'AGENCY')) {
    return next(createError(403, 'Forbidden: Access restricted to ADMIN or AGENCY roles.'));
  }
  next();
};

// Middleware to check if user is SUPERVISOR or ADMIN
const isSupervisorOrAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'SUPERVISOR')) {
    return next(createError(403, 'Forbidden: Access restricted to SUPERVISOR or ADMIN roles.'));
  }
  next();
};

// Middleware to check if user is SUPERVISOR
const isSupervisor = (req, res, next) => {
  if (!req.user || req.user.role !== 'SUPERVISOR') {
    return next(createError(403, 'Forbidden: Access restricted to SUPERVISOR role.'));
  }
  next();
};

/**
 * @swagger
 * /vendor-orders/get-order-details:
 *   get:
 *     summary: Get vendor order details for a specific date
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date to fetch order details for (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of vendor orders for the specified date.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Invalid date format.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/get-order-details', auth, vendorOrderController.getOrderDetailsByDate);

// POST /api/vendor-orders - Create a new vendor order
/**
 * @swagger
 * /vendor-orders:
 *   post:
 *     summary: Create a new vendor order
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewVendorOrderRequest'
 *     responses:
 *       201:
 *         description: Vendor order created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (e.g., missing fields, validation error, PO number exists).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Product or Agency not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/', auth, vendorOrderController.createVendorOrder);

// GET /api/vendor-orders - Get all vendor orders (for ADMIN, AGENCY)
/**
 * @swagger
 * /vendor-orders:
 *   get:
 *     summary: Get all vendor orders (Primarily for ADMIN/AGENCY roles)
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PO number, vendor name, product name, agency name.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ASSIGNED, DELIVERED, RECEIVED, CANCELLED]
 *         description: Filter by order status.
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: integer
 *         description: Filter by vendor ID.
 *       - in: query
 *         name: agencyId
 *         schema:
 *           type: integer
 *         description: Filter by agency ID (for any item in the order).
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Field to sort by (e.g., createdAt, orderDate, totalAmount).
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: A list of vendor orders.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderListResponse'
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', auth, vendorOrderController.getAllVendorOrders);

// GET /api/vendor-orders/my - Get orders for the logged-in VENDOR
/**
 * @swagger
 * /vendor-orders/my:
 *   get:
 *     summary: Get orders for the logged-in VENDOR
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PO number, product name, agency name.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ASSIGNED, DELIVERED, RECEIVED, CANCELLED]
 *         description: Filter by order status.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: A list of the vendor's orders.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderListResponse'
 *       401:
 *         description: Unauthorized (User is not a VENDOR or not logged in).
 *       403:
 *         description: Forbidden (User is not a VENDOR).
 *       500:
 *         description: Internal server error.
 */
router.get('/my', auth, vendorOrderController.getMyVendorOrders);

// GET /api/vendor-orders/my-agency-orders - Get orders for the logged-in AGENCY
/**
 * @swagger
 * /vendor-orders/my-agency-orders:
 *   get:
 *     summary: Get orders associated with the logged-in AGENCY
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PO number, vendor name, product name.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ASSIGNED, DELIVERED, RECEIVED, CANCELLED]
 *         description: Filter by order status.
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: integer
 *         description: Filter by vendor ID.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: A list of the agency's orders.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderListResponse'
 *       401:
 *         description: Unauthorized (User is not an AGENCY or not logged in).
 *       403:
 *         description: Forbidden (User is not an AGENCY).
 *       500:
 *         description: Internal server error.
 */
router.get('/my-agency-orders', auth, vendorOrderController.getMyAgencyOrders);

// GET /api/vendor-orders/my-supervisor-orders - Get orders for the logged-in SUPERVISOR's assigned agency
/**
 * @swagger
 * /vendor-orders/my-supervisor-orders:
 *   get:
 *     summary: Get orders for the logged-in SUPERVISOR's assigned agency
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PO number, vendor name, product name.
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by order date (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: A list of the supervisor's assigned agency orders (DELIVERED and RECEIVED status).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderListResponse'
 *       401:
 *         description: Unauthorized (User is not a SUPERVISOR or not logged in).
 *       403:
 *         description: Forbidden (User is not a SUPERVISOR).
 *       404:
 *         description: Supervisor profile not found or no agency assigned.
 *       500:
 *         description: Internal server error.
 */
router.get('/my-supervisor-orders', auth, vendorOrderController.getMySupervisorAgencyOrders);

// GET /api/vendor-orders/:id - Get a single vendor order by ID
/**
 * @swagger
 * /vendor-orders/{id}:
 *   get:
 *     summary: Get a single vendor order by ID
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order.
 *     responses:
 *       200:
 *         description: Details of the vendor order.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Invalid ID format.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., VENDOR trying to access another VENDOR's order).
 *       404:
 *         description: Vendor order not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/:id', auth, vendorOrderController.getVendorOrderById);

// PUT /api/vendor-orders/:id - Update a vendor order (e.g., notes, PO number)
/**
 * @swagger
 * /vendor-orders/{id}:
 *   put:
 *     summary: Update a vendor order (details and/or items)
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateVendorOrderRequest'
 *     responses:
 *       200:
 *         description: Vendor order updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (validation errors, invalid ID, PO number exists).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., order status does not allow update).
 *       404:
 *         description: Vendor order, Product, or Agency not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/:id', auth, vendorOrderController.updateVendorOrder);

// PATCH /api/vendor-orders/:id/status - Update vendor order status (e.g., PENDING -> ASSIGNED -> DELIVERED)
/**
 * @swagger
 * /vendor-orders/{id}/status:
 *   patch:
 *     summary: Update the status of a vendor order
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StatusUpdateRequest'
 *     responses:
 *       200:
 *         description: Vendor order status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (invalid status or status transition not allowed).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (User role not allowed to set this status).
 *       404:
 *         description: Vendor order not found.
 *       500:
 *         description: Internal server error.
 */
router.patch('/:id/status', auth, vendorOrderController.updateVendorOrderStatus);

// PATCH /api/vendor-orders/:id/delivery - Mark order as delivered (by VENDOR or ADMIN/AGENCY)
/**
 * @swagger
 * /vendor-orders/{id}/delivery:
 *   patch:
 *     summary: Mark a vendor order as delivered
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeliveryNotesRequest'
 *     responses:
 *       200:
 *         description: Order marked as delivered.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (e.g., order already delivered or invalid status).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (User role not allowed or not the assigned vendor).
 *       404:
 *         description: Vendor order not found.
 *       500:
 *         description: Internal server error.
 */
router.patch('/:id/delivery', auth, vendorOrderController.markOrderDelivered);

// PUT /api/vendor-orders/:id/record-delivery - Record delivered quantities for order items
/**
 * @swagger
 * /vendor-orders/{id}/record-delivery:
 *   put:
 *     summary: Record delivered quantities for items in a vendor order
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecordDeliveryRequest'
 *     responses:
 *       200:
 *         description: Delivered quantities recorded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (e.g., validation error, item not found, quantity mismatch).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., order status does not allow recording delivery).
 *       404:
 *         description: Vendor order or order item not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/:id/record-delivery', auth, vendorOrderController.recordDelivery);

// PUT /api/vendor-orders/:id/record-receipt - Record received quantities for order items
/**
 * @swagger
 * /vendor-orders/{id}/record-receipt:
 *   put:
 *     summary: Record received quantities for items in a vendor order
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecordReceiptRequest'
 *     responses:
 *       200:
 *         description: Received quantities recorded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (e.g., validation error, item not found, quantity mismatch).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., order status does not allow recording receipt).
 *       404:
 *         description: Vendor order or order item not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/:id/record-receipt', auth, vendorOrderController.recordReceipt);

// PUT /api/vendor-orders/:id/record-supervisor-quantity - Record supervisor quantities for order items
/**
 * @swagger
 * /vendor-orders/{id}/record-supervisor-quantity:
 *   put:
 *     summary: Record supervisor quantities for items in a vendor order
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecordSupervisorQuantityRequest'
 *     responses:
 *       200:
 *         description: Supervisor quantities recorded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (e.g., validation error, item not found, quantity exceeds received quantity).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (e.g., order status does not allow recording supervisor quantity or user is not SUPERVISOR/ADMIN).
 *       404:
 *         description: Vendor order or order item not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/:id/record-supervisor-quantity', auth, isSupervisorOrAdmin, vendorOrderController.recordSupervisorQuantity);

// PATCH /api/vendor-orders/:id/reception - Mark order as received (by AGENCY who placed it or ADMIN)
// This might require knowing which agency placed the order, or if it's a general reception confirmation.
// For now, let's assume an authorized user confirms reception.
/**
 * @swagger
 * /vendor-orders/{id}/reception:
 *   patch:
 *     summary: Mark a vendor order as received
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReceptionNotesRequest'
 *     responses:
 *       200:
 *         description: Order marked as received.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VendorOrderResponse'
 *       400:
 *         description: Bad request (e.g., order already received or invalid status).
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (User role not allowed or not the receiving agency).
 *       404:
 *         description: Vendor order not found.
 *       500:
 *         description: Internal server error.
 */
router.patch('/:id/reception', auth, vendorOrderController.markOrderReceived);

// DELETE /api/vendor-orders/:id - Delete a vendor order (ADMIN only - use with caution)
/**
 * @swagger
 * /vendor-orders/{id}:
 *   delete:
 *     summary: Delete a vendor order (ADMIN only)
 *     tags: [Vendor Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor order to delete.
 *     responses:
 *       200:
 *         description: Vendor order deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid ID format.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (User is not an ADMIN or order status prevents deletion).
 *       404:
 *         description: Vendor order not found.
 *       409:
 *         description: Conflict (e.g., cannot delete order due to related records if not handled by cascade).
 *       500:
 *         description: Internal server error.
 */
router.delete('/:id', auth, vendorOrderController.deleteVendorOrder);


module.exports = router;
