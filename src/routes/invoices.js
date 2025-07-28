const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { roleGuard } = require('../middleware/authorize');
const {
  generateInvoice,
  downloadInvoiceByOrder,
  checkInvoiceExists,
  getInvoiceBySubscription,
  regenerateAllInvoicesEndpoint,
  regenerateAllInvoicesKeepNumbersEndpoint
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

// Regenerate all invoices with new numbers (Admin only)
router.route('/regenerate-all')
  .post(auth, roleGuard('ADMIN'), regenerateAllInvoicesEndpoint);

// Regenerate all invoices keeping existing numbers (Admin only)
router.route('/regenerate-all-keep-numbers')
  .post(auth, roleGuard('ADMIN'), regenerateAllInvoicesKeepNumbersEndpoint);

module.exports = router;
