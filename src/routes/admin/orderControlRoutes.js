const express = require('express');
const router = express.Router();
const {
  getOrdersByDeliveryDate,
  updateItemQuantity,
  toggleItemCancellation,
  getDateStatistics,
  downloadOrderControlDetailedPdf,
  downloadOrderControlSummaryPdf,
} = require('../../controllers/admin/orderControlController');
// Authentication and authorization are handled at the app level

/**
 * @route   GET /api/admin/order-control/orders-by-date
 * @desc    Get SNF orders by delivery date with items
 * @access  Private/Admin
 */
router.get('/orders-by-date', getOrdersByDeliveryDate);

/**
 * @route   PATCH /api/admin/order-control/update-item-quantity
 * @desc    Update quantity of an SNF order item
 * @access  Private/Admin
 */
router.patch('/update-item-quantity', updateItemQuantity);

/**
 * @route   PATCH /api/admin/order-control/toggle-item-cancellation
 * @desc    Toggle cancellation status of an SNF order item
 * @access  Private/Admin
 */
router.patch('/toggle-item-cancellation', toggleItemCancellation);

/**
 * @route   GET /api/admin/order-control/date-statistics
 * @desc    Get order statistics for a specific delivery date
 * @access  Private/Admin
 */
router.get('/date-statistics', getDateStatistics);

/**
 * @route   GET /api/admin/order-control/download-detailed-pdf
 * @desc    Download detailed Order Control PDF for a date
 * @access  Private/Admin
 */
router.get('/download-detailed-pdf', downloadOrderControlDetailedPdf);

/**
 * @route   GET /api/admin/order-control/download-summary-pdf
 * @desc    Download summary Order Control PDF for a date
 * @access  Private/Admin
 */
router.get('/download-summary-pdf', downloadOrderControlSummaryPdf);

module.exports = router;
