const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/auth');
const { allowRoles, roleGuard } = require('../middleware/authorize');

// Protect all report routes with auth middleware
router.use(authMiddleware);

// Purchase Order Report endpoints
router.get(
  '/purchase-orders',
  allowRoles('ADMIN', 'VENDOR'),
  roleGuard(),
  reportController.getPurchaseOrderReport
);
router.get(
  '/filters',
  allowRoles('ADMIN', 'VENDOR'),
  roleGuard(),
  reportController.getReportFilters
);

// Delivery agencies report
router.get(
  '/delivery-agencies',
  allowRoles('ADMIN', 'AGENCY'),
  roleGuard(),
  reportController.getDeliveryAgenciesReport
);
router.get(
  '/delivery-filters',
  allowRoles('ADMIN', 'AGENCY'),
  roleGuard(),
  reportController.getDeliveryFilters
);

// Delivery summaries report
router.get(
  '/delivery-summaries',
  allowRoles('ADMIN', 'AGENCY'),
  roleGuard(),
  reportController.getDeliverySummariesReport
);

// Subscription reports
router.get(
  '/subscriptions',
  allowRoles('ADMIN'),
  roleGuard(),
  reportController.getSubscriptionReports
);

module.exports = router;
