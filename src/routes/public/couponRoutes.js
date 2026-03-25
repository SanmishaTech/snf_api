const express = require('express');
const router = express.Router();
const { validateCoupon } = require('../../controllers/couponController');

/**
 * @route   POST /api/public/coupons/validate
 * @desc    Validate a coupon code for checkout
 * @access  Public
 */
router.post('/validate', validateCoupon);

module.exports = router;
