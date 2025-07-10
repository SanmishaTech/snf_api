const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const {
  generateInvoice,
  downloadInvoiceByOrder,
  checkInvoiceExists,
  getInvoiceBySubscription
} = require('../controllers/invoiceController');

// Routes
// Generate invoice for an order (Admin only)
router.route('/generate/:orderId')
  .post(generateInvoice);

// Download invoice PDF by order ID
router.route('/download/order/:orderId')
  .get(downloadInvoiceByOrder);

// Check if invoice exists for an order
router.route('/exists/order/:orderId')
  .get(checkInvoiceExists);

// Get invoice information by subscription ID
router.route('/subscription/:subscriptionId')
  .get(getInvoiceBySubscription);

module.exports = router;
