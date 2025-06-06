const asyncHandler = require('../middleware/asyncHandler');
const { PrismaClient, TransactionType, TransactionStatus } = require('@prisma/client'); // Added TransactionType and TransactionStatus
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

  // 2. Find or create the Wallet for the Member.id
  let wallet;
  try {
    console.log(`Looking for wallet for memberId: ${member.id}`);
    wallet = await prisma.wallet.findUnique({
      where: { memberId: member.id },
    });
    console.log('Wallet findUnique result:', wallet); // Log wallet find result
  } catch (dbError) {
    console.error('Error finding wallet:', dbError);
    return res.status(500).json({ success: false, message: 'Error finding wallet data.'});
  }


  if (!wallet) {
    console.log(`Wallet not found for memberId: ${member.id}. Creating new wallet.`);
    try {
      wallet = await prisma.wallet.create({
        data: {
          memberId: member.id,
          balance: 0.0,
          currency: 'INR', // Or your default currency
        },
      });
      console.log('New wallet created:', wallet); // Log new wallet creation
    } catch (dbError) {
      console.error('Error creating wallet:', dbError);
      return res.status(500).json({ success: false, message: 'Error creating wallet.'});
    }
  }

  // 3. Find transactions for this wallet
  let transactions;
  try {
    transactions = await prisma.transaction.findMany({
      where: { walletId: wallet.id, status: TransactionStatus.PAID },
      orderBy: { createdAt: 'desc' },
    });
    console.log(`Found ${transactions.length} PAID transactions for walletId: ${wallet.id}`);
  } catch (dbError) {
    console.error('Error fetching transactions:', dbError);
    return res.status(500).json({ success: false, message: 'Error fetching transactions.'});
  }

  console.log('Successfully processed getUserWallet. Sending response.');
  res.status(200).json({
    success: true,
    data: {
      walletId: wallet.id,
      balance: wallet.balance,
      currency: wallet.currency,
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

    const transaction = await prisma.transaction.create({
      data: {
        userId: userId, // This is the User's ID
        amount: parseFloat(amount),
        status: TransactionStatus.PENDING,
        type: TransactionType.CREDIT,
        // walletId will be null until an admin approves and links it to the member's wallet
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
      include: { wallet: true }, // Include the wallet details
    });

    if (!member) {
      // This case should ideally not happen if a member record is created upon user registration
      return res.status(404).json({ success: false, message: 'Member profile not found.' });
    }

    // If wallet doesn't exist, balance is 0. The wallet's balance should reflect only PAID transactions.
    const balance = member.wallet ? member.wallet.balance : 0.0;
    const currency = member.wallet ? member.wallet.currency : 'INR'; // Default currency

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
