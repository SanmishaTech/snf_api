const express = require('express');
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

router.get('/get-order-details', vendorOrderController.getOrderDetailsByDate);

// POST /api/vendor-orders - Create a new vendor order
router.post('/', auth, vendorOrderController.createVendorOrder);

// GET /api/vendor-orders - Get all vendor orders (for ADMIN, AGENCY)
router.get('/', auth, vendorOrderController.getAllVendorOrders);

// GET /api/vendor-orders/my - Get orders for the logged-in VENDOR
router.get('/my', auth, vendorOrderController.getMyVendorOrders);

// GET /api/vendor-orders/my-agency-orders - Get orders for the logged-in AGENCY
router.get('/my-agency-orders', auth, vendorOrderController.getMyAgencyOrders);

// GET /api/vendor-orders/:id - Get a single vendor order by ID
router.get('/:id', auth, vendorOrderController.getVendorOrderById);

// PUT /api/vendor-orders/:id - Update a vendor order (e.g., notes, PO number)
router.put('/:id', vendorOrderController.updateVendorOrder);

// PATCH /api/vendor-orders/:id/status - Update vendor order status (e.g., PENDING -> ASSIGNED -> DELIVERED)
router.patch('/:id/status', vendorOrderController.updateVendorOrderStatus);

// PATCH /api/vendor-orders/:id/delivery - Mark order as delivered (by VENDOR or ADMIN/AGENCY)
router.patch('/:id/delivery', vendorOrderController.markOrderDelivered);

// PUT /api/vendor-orders/:id/record-delivery - Record delivered quantities for order items
router.put('/:id/record-delivery', auth, vendorOrderController.recordDelivery);

// PUT /api/vendor-orders/:id/record-receipt - Record received quantities for order items
router.put('/:id/record-receipt', auth, vendorOrderController.recordReceipt);

// PATCH /api/vendor-orders/:id/reception - Mark order as received (by AGENCY who placed it or ADMIN)
// This might require knowing which agency placed the order, or if it's a general reception confirmation.
// For now, let's assume an authorized user confirms reception.
router.patch('/:id/reception', vendorOrderController.markOrderReceived);

// DELETE /api/vendor-orders/:id - Delete a vendor order (ADMIN only - use with caution)
router.delete('/:id', vendorOrderController.deleteVendorOrder);


module.exports = router;
