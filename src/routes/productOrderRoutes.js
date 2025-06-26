const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
    createOrderWithSubscriptions,
    getAllProductOrders,
    getProductOrderById,
    updateProductOrder,
    updateProductOrderPayment,
} = require('../controllers/productOrderController');
const { roleGuard } = require('../middleware/authorize');

// Create a new product order with multiple subscriptions
router.post(
  '/with-subscriptions',
  authMiddleware,
  createOrderWithSubscriptions
);

// Get all product orders (admin only)
router.get(
    '/', 
    authMiddleware,

    roleGuard('ADMIN'),
    getAllProductOrders
);

// Get a single product order by ID
router.get(
    '/:id',
     roleGuard('ADMIN', 'MEMBER'),
    getProductOrderById
);

// Update a product order (admin only)
router.put(
    '/:id',
    roleGuard('ADMIN'),
    updateProductOrder
);

// Update payment for a product order (admin only)
router.put(
  '/:id/payment',
  authMiddleware,
  roleGuard('ADMIN'),
  updateProductOrderPayment
);

module.exports = router;
