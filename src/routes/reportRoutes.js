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
  allowRoles('ADMIN', 'SUPER_ADMIN', 'VENDOR'),
  roleGuard(),
  reportController.getPurchaseOrderReport
);
router.get(
  '/filters',
  allowRoles('ADMIN', 'SUPER_ADMIN', 'VENDOR'),
  roleGuard(),
  reportController.getReportFilters
);

// Delivery agencies report
router.get(
  '/delivery-agencies',
  allowRoles('ADMIN', 'SUPER_ADMIN', 'AGENCY'),
  roleGuard(),
  reportController.getDeliveryAgenciesReport
);
router.get(
  '/delivery-filters',
  allowRoles('ADMIN', 'SUPER_ADMIN', 'AGENCY'),
  roleGuard(),
  reportController.getDeliveryFilters
);

// Delivery summaries report
router.get(
  '/delivery-summaries',
  allowRoles('ADMIN', 'SUPER_ADMIN', 'AGENCY'),
  roleGuard(),
  reportController.getDeliverySummariesReport
);

// Subscription reports
router.get(
  '/subscriptions',
  allowRoles('ADMIN', 'SUPER_ADMIN'),
  roleGuard(),
  reportController.getSubscriptionReports
);

// Sale Register report
router.get(
  '/sale-register',
  allowRoles('ADMIN', 'SUPER_ADMIN'),
  roleGuard(),
  reportController.getSaleRegisterReport
);

// Revenue report
router.get(
  '/revenue',
  allowRoles('ADMIN', 'SUPER_ADMIN'),
  roleGuard(),
  reportController.getRevenueReport
);

// Wallet report
router.get(
  '/wallet',
  allowRoles('ADMIN', 'SUPER_ADMIN'),
  roleGuard(),
  reportController.getWalletReport
);

router.get(
  '/exceptions',
  allowRoles('ADMIN', 'SUPER_ADMIN'),
  roleGuard(),
  reportController.getExceptionReport
);

module.exports = router;
