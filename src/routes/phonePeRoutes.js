const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { roleGuard } = require('../middleware/authorize');
const {
  initiatePayment,
  getPaymentStatus,
  handleWebhook,
  listTransactions,
} = require('../controllers/phonePeController');

// POST /api/phonepe/initiate - PUBLIC (matches snf-orders which is also public)
// Auth is optional; memberId is derived from the order record on the backend
router.post('/initiate', initiatePayment);

// GET /api/phonepe/status/:merchantOrderId - PUBLIC (needed for callback page polling)
router.get('/status/:merchantOrderId', getPaymentStatus);

// POST /api/phonepe/webhook - PUBLIC, no auth, raw body
// express.text() parses the body as a string so we can pass raw string to SDK
router.post('/webhook', express.text({ type: '*/*' }), handleWebhook);

// GET /api/phonepe/transactions - admin only
router.get('/transactions', authMiddleware, roleGuard('ADMIN'), listTransactions);

module.exports = router;

