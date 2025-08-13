const { PrismaClient } = require('@prisma/client');
const asyncHandler = require('express-async-handler');

const prisma = new PrismaClient();

// @desc    Get user wallet details with transaction history
// @route   GET /api/wallet
// @access  Private
const getUserWallet = asyncHandler(async (req, res) => {
  // Get member from authenticated user
  const member = await prisma.member.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      walletBalance: true,
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });

  if (!member) {
    res.status(404);
    throw new Error('Member profile not found');
  }

  // Get wallet transactions
  const transactions = await prisma.walletTransaction.findMany({
    where: { memberId: member.id },
    orderBy: { createdAt: 'desc' },
    take: 50, // Limit to last 50 transactions
    select: {
      id: true,
      amount: true,
      type: true,
      status: true,
      paymentMethod: true,
      referenceNumber: true,
      notes: true,
      createdAt: true,
      updatedAt: true
    }
  });

  res.status(200).json({
    success: true,
    data: {
      balance: member.walletBalance,
      member: {
        name: member.user?.name,
        email: member.user?.email
      },
      transactions
    }
  });
});

// @desc    Create a top-up request
// @route   POST /api/wallet/transactions
// @access  Private
const createTopUpRequest = asyncHandler(async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    res.status(400);
    throw new Error('Amount must be a positive number');
  }

  // Get member from authenticated user
  const member = await prisma.member.findUnique({
    where: { userId: req.user.id },
    select: { id: true }
  });

  if (!member) {
    res.status(404);
    throw new Error('Member profile not found');
  }

  // Create pending transaction
  const transaction = await prisma.walletTransaction.create({
    data: {
      memberId: member.id,
      amount: parseFloat(amount),
      type: 'CREDIT',
      status: 'PENDING',
      paymentMethod: 'ONLINE',
      notes: 'Top-up request'
    }
  });

  res.status(201).json({
    success: true,
    data: transaction
  });
});

// @desc    Get current wallet balance
// @route   GET /api/wallet/balance
// @access  Private
const getCurrentBalance = asyncHandler(async (req, res) => {
  // Get member from authenticated user
  const member = await prisma.member.findUnique({
    where: { userId: req.user.id },
    select: {
      walletBalance: true
    }
  });

  if (!member) {
    res.status(404);
    throw new Error('Member profile not found');
  }

  res.status(200).json({
    success: true,
    data: {
      balance: member.walletBalance,
      currency: 'INR'
    }
  });
});

module.exports = {
  getUserWallet,
  createTopUpRequest,
  getCurrentBalance
};