const asyncHandler = require('../middleware/asyncHandler');
const { PrismaClient, TransactionType, TransactionStatus } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * @desc    Get current user's wallet details
 * @route   GET /api/wallet
 * @access  Private
 */
exports.getUserWallet = asyncHandler(async (req, res, next) => {
  console.log('Entering getUserWallet'); // Log entry
  const userId = req.user ? req.user.id : null; // Safely access req.user.id
  console.log('Authenticated userId:', userId); // Log userId

  if (!userId) {
    console.log('User not authenticated or userId missing.');
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }

  // 1. Find the Member associated with the User.id
  let member;
  try {
    member = await prisma.member.findUnique({
      where: { userId: userId },
    });
    console.log('Member lookup result:', member); // Log member lookup
  } catch (dbError) {
    console.error('Error fetching member:', dbError);
    return res.status(500).json({ success: false, message: 'Error fetching member data.'});
  }
  

  if (!member) {
    console.log(`Member profile not found for userId: ${userId}`);
    return res.status(404).json({ success: false, message: 'Member profile not found for the authenticated user.' });
  }

  // 2. Fetch PAID walletTransactions for this member
  let transactions;
  try {
    transactions = await prisma.walletTransaction.findMany({
      where: { memberId: member.id, status: TransactionStatus.PAID },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`Found ${transactions.length} PAID transactions for memberId: ${member.id}`);
  } catch (dbError) {
    console.error('Error fetching wallet transactions:', dbError);
    return res.status(500).json({ success: false, message: 'Error fetching transactions.'});
  }

  console.log('Successfully processed getUserWallet. Sending response.');
  res.status(200).json({
    success: true,
    data: {
      balance: member.walletBalance,
      currency: 'INR',
      transactions: transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        status: tx.status,
        notes: tx.notes,
        paymentMethod: tx.paymentMethod,
        referenceNumber: tx.referenceNumber,
        timestamp: tx.createdAt,
        updatedAt: tx.updatedAt,
      })),
    },
  });
});

/**
 * @desc    Create a new top-up transaction request
 * @route   POST /api/wallet/transactions
 * @access  Private (Member)
 */
exports.createTopUpRequest = asyncHandler(async (req, res, next) => {
  const userId = req.user.id; // Assuming req.user.id is available from authMiddleware
  const { amount } = req.body;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid amount specified. Amount must be a positive number.' });
  }

  try {
    const member = await prisma.member.findUnique({
      where: { userId: userId },
    });

    if (!member) {
      return res.status(404).json({ success: false, message: 'Member profile not found for this user.' });
    }

    const transaction = await prisma.walletTransaction.create({
      data: {
        memberId: member.id,
        amount: parseFloat(amount),
        status: TransactionStatus.PENDING,
        type: TransactionType.CREDIT,
      },
    });

    res.status(201).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error('Error creating top-up request:', error);
    next(error);
  }
});

/**
 * @desc    Get current member's wallet balance
 * @route   GET /api/wallet/balance
 * @access  Private (Member)
 */
exports.getCurrentBalance = asyncHandler(async (req, res, next) => {
  const userId = req.user.id; // Assuming req.user.id is available from authMiddleware

  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }

  try {
    const member = await prisma.member.findUnique({
      where: { userId: userId },
      select: { walletBalance: true },
    });

    if (!member) {
      // This case should ideally not happen if a member record is created upon user registration
      return res.status(404).json({ success: false, message: 'Member profile not found.' });
    }

    const balance = member.walletBalance;
    const currency = 'INR'; // Default currency

    res.status(200).json({
      success: true,
      data: {
        balance: balance,
        currency: currency,
      },
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    next(error);
  }
});
