const asyncHandler = require('express-async-handler');
const prisma = require('../config/db');

/**
 * @desc    Get all coupons
 * @route   GET /api/admin/coupons
 * @access  Admin
 */
const getAllCoupons = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = '' } = req.query;
  const skip = (page - 1) * limit;

  const where = search ? {
    code: { contains: search }
  } : {};

  const [coupons, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      skip: parseInt(skip),
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.coupon.count({ where }),
  ]);

  res.json({
    coupons,
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / limit),
    totalRecords: total,
  });
});

/**
 * @desc    Get coupon by ID
 * @route   GET /api/admin/coupons/:id
 * @access  Admin
 */
const getCouponById = asyncHandler(async (req, res) => {
  const coupon = await prisma.coupon.findUnique({
    where: { id: parseInt(req.params.id) },
  });

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  res.json(coupon);
});

/**
 * @desc    Create a coupon
 * @route   POST /api/admin/coupons
 * @access  Admin
 */
const createCoupon = asyncHandler(async (req, res) => {
  const { 
    code, 
    discountType, 
    discountValue, 
    minOrderAmount, 
    fromDate, 
    toDate, 
    usageLimit, 
    isActive 
  } = req.body;

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    res.status(400);
    throw new Error('Coupon code already exists');
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: code.toUpperCase(),
      discountType,
      discountValue: parseFloat(discountValue),
      minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      isActive: isActive !== undefined ? isActive : true,
    },
  });

  res.status(201).json(coupon);
});

/**
 * @desc    Update a coupon
 * @route   PUT /api/admin/coupons/:id
 * @access  Admin
 */
const updateCoupon = asyncHandler(async (req, res) => {
  const { 
    code, 
    discountType, 
    discountValue, 
    minOrderAmount, 
    fromDate, 
    toDate, 
    usageLimit, 
    isActive 
  } = req.body;

  const coupon = await prisma.coupon.findUnique({
    where: { id: parseInt(req.params.id) },
  });

  if (!coupon) {
    res.status(404);
    throw new Error('Coupon not found');
  }

  const updated = await prisma.coupon.update({
    where: { id: parseInt(req.params.id) },
    data: {
      code: code?.toUpperCase(),
      discountType,
      discountValue: discountValue !== undefined ? parseFloat(discountValue) : undefined,
      minOrderAmount: minOrderAmount !== undefined ? parseFloat(minOrderAmount) : undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      usageLimit: usageLimit !== undefined ? parseInt(usageLimit) : undefined,
      isActive: isActive !== undefined ? isActive : undefined,
    },
  });

  res.json(updated);
});

/**
 * @desc    Delete a coupon
 * @route   DELETE /api/admin/coupons/:id
 * @access  Admin
 */
const deleteCoupon = asyncHandler(async (req, res) => {
  await prisma.coupon.delete({
    where: { id: parseInt(req.params.id) },
  });
  res.json({ message: 'Coupon deleted' });
});

/**
 * @desc    Validate coupon for checkout
 * @route   POST /api/public/coupons/validate
 * @access  Public
 */
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, amount } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: 'Coupon code is required' });
  }

  const normalizedCode = code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizedCode },
  });

  if (!coupon || !coupon.isActive) {
    return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
  }

  const now = new Date();
  if (coupon.fromDate && now < new Date(coupon.fromDate)) {
    return res.status(400).json({ success: false, message: 'Coupon is not yet valid' });
  }
  if (coupon.toDate && now > new Date(coupon.toDate)) {
    return res.status(400).json({ success: false, message: 'Coupon has expired' });
  }

  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return res.status(400).json({ success: false, message: 'Coupon limit reached' });
  }

  if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
    return res.status(400).json({ 
      success: false, 
      message: `Minimum order amount of ₹${coupon.minOrderAmount} required` 
    });
  }

  let discountAmount = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    discountAmount = (amount * coupon.discountValue) / 100;
  } else if (coupon.discountType === 'CASH') {
    discountAmount = coupon.discountValue;
  }

  res.json({
    success: true,
    message: 'Coupon valid',
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
    },
    discountAmount: Math.min(discountAmount, amount),
  });
});

module.exports = {
  getAllCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
};
