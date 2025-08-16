const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/auth');

// Protect all report routes with auth middleware
router.use(authMiddleware);

// Purchase Order Report endpoints
router.get('/purchase-orders', reportController.getPurchaseOrderReport);
router.get('/filters', reportController.getReportFilters);

// Delivery agencies report
router.get('/delivery-agencies', reportController.getDeliveryAgenciesReport);
router.get('/delivery-filters', reportController.getDeliveryFilters);

// Delivery summaries report
router.get('/delivery-summaries', reportController.getDeliverySummariesReport);

// Subscription reports
router.get('/subscriptions', reportController.getSubscriptionReports);

module.exports = router;
