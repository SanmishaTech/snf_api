const express = require('express');
const router = express.Router();
const { createSNFOrder, getSNFOrderByOrderNo } = require('../controllers/snfOrderController');
const { getSNFOrderInvoiceStatus, downloadSNFOrderInvoiceByOrderNo } = require('../controllers/snfOrderInvoiceController');
const authMiddleware = require('../middleware/auth');
const optionalAuthMiddleware = require('../middleware/optionalAuth');

// Public create (optionally authenticated if token present)
router.post('/', optionalAuthMiddleware, createSNFOrder);

// Public fetch by orderNo
router.get('/:orderNo', getSNFOrderByOrderNo);

// Public invoice status by orderNo
router.get('/:orderNo/invoice-status', getSNFOrderInvoiceStatus);

// Public invoice download by orderNo
router.get('/:orderNo/download-invoice', downloadSNFOrderInvoiceByOrderNo);

module.exports = router;
