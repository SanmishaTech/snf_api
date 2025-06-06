const { PrismaClient, TransactionStatus } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper function to find or create a wallet for a member (primarily for GET operations)
async function findOrCreateWalletForGetOperations(memberId, prismaInstance = prisma) {
  let wallet = await prismaInstance.wallet.findUnique({
    where: { memberId: parseInt(memberId) },
  });

  if (!wallet) {
    wallet = await prismaInstance.wallet.create({
      data: {
        memberId: parseInt(memberId),
        balance: 0.0,
        currency: 'INR',
      },
    });
  }
  return wallet;
}

/**
 * @desc Get all member wallet balances
 * @route GET /api/admin/wallets
 * @access Private (Admin)
 */
exports.getMemberWallets = async (req, res, next) => {
  try {
    const membersWithWallets = await prisma.member.findMany({
      include: {
        wallet: true,
        user: { select: { name: true, email: true } },
      },
    });

    const memberWallets = membersWithWallets.map(member => ({
      memberId: member.id,
      memberName: member.user?.name || member.name,
      memberEmail: member.user?.email,
      wallet: member.wallet ? {
        walletId: member.wallet.id,
        balance: member.wallet.balance,
        currency: member.wallet.currency,
        updatedAt: member.wallet.updatedAt,
      } : {
        walletId: null,
        balance: 0.0,
        currency: 'INR',
        updatedAt: null,
        status: 'No wallet associated. Default values shown.',
      },
    }));

    res.status(200).json({ success: true, data: memberWallets });
  } catch (error) {
    console.error('Error fetching member wallets:', error);
    next(error);
  }
};

/**
 * @desc Get a specific member's wallet balance and transaction history
 * @route GET /api/admin/wallets/:memberId
 * @access Private (Admin)
 */
exports.getMemberWalletDetails = async (req, res, next) => {
  const { memberId } = req.params;
  const memberIdInt = parseInt(memberId);

  if (isNaN(memberIdInt)) {
    return res.status(400).json({ success: false, message: 'Invalid member ID.' });
  }

  try {
    const member = await prisma.member.findUnique({
      where: { id: memberIdInt },
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    if (!member) {
      return res.status(404).json({ success: false, message: `Member with ID ${memberIdInt} not found.` });
    }

    // Find or create wallet for consistent response structure
    const walletEntity = await findOrCreateWalletForGetOperations(memberIdInt);

    // Fetch transactions already linked to the wallet
    const walletTransactions = await prisma.transaction.findMany({
      where: { walletId: walletEntity.id },
      orderBy: { createdAt: 'desc' },
      include: { 
        processedByAdmin: { select: { name: true, email: true } },
        user: { select: { name: true, email: true } } // Include initiator user details
      },
    });

    // Fetch PENDING CREDIT transactions initiated by the member (userId) but not yet linked to a wallet
    // These are typically user top-up requests awaiting approval.
    let pendingUserTransactions = [];
    if (member.userId) { // Ensure member.userId is available
      pendingUserTransactions = await prisma.transaction.findMany({
        where: {
          userId: member.userId, // Link to the User who initiated it
          walletId: null,        // Not yet assigned to a wallet
          status: TransactionStatus.PENDING,
          type: 'CREDIT'         // Specifically top-up requests
        },
        orderBy: { createdAt: 'desc' },
        include: { 
          processedByAdmin: { select: { name: true, email: true } }, // Usually null for these
          user: { select: { name: true, email: true } } // Initiator details
        },
      });
    }

    // Combine and sort all transactions
    // We filter out any pendingUserTransactions that might somehow already be in walletTransactions (e.g., if walletId was later assigned but status remained PENDING)
    // This is a safeguard, typically pendingUserTransactions should have walletId: null
    const combinedTransactions = [
      ...walletTransactions,
      ...pendingUserTransactions.filter(pt => !walletTransactions.some(wt => wt.id === pt.id))
    ];

    combinedTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const transactions = combinedTransactions; // Use the combined list for mapping

    const walletDetails = {
      walletId: walletEntity.id,
      balance: walletEntity.balance,
      currency: walletEntity.currency,
      updatedAt: walletEntity.updatedAt,
      transactions: transactions.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        status: t.status, // Added status here
        paymentMethod: t.paymentMethod,
        referenceNumber: t.referenceNumber,
        notes: t.notes,
        adminName: t.processedByAdmin?.name || 'N/A', // Admin who processed (approved/rejected)
        processedByAdminId: t.processedByAdminId,
        userName: t.user?.name, // User who initiated (for PENDING top-ups)
        userEmail: t.user?.email,
        timestamp: t.createdAt,
      })),
    };

    res.status(200).json({
      success: true,
      data: {
        memberId: member.id,
        memberName: member.user?.name || member.name,
        memberEmail: member.user?.email,
        wallet: walletDetails,
      },
    });
  } catch (error) {
    console.error(`Error fetching wallet details for member ${memberIdInt}:`, error);
    next(error);
  }
};

/**
 * @desc Add funds to a member's wallet (Creates a COMPLETED CREDIT transaction)
 * @route POST /api/admin/wallets/:memberId/add-funds
 * @access Private (Admin)
 */
exports.addFundsToWallet = async (req, res, next) => {
  const { memberId } = req.params;
  const { amount, paymentMethod, referenceNumber, notes } = req.body;
  const adminId = req.user?.id; // Assumes auth middleware populates req.user

  if (!adminId) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Admin ID not found. Ensure you are logged in.' });
  }

  const memberIdInt = parseInt(memberId);
  const amountFloat = parseFloat(amount);

  if (isNaN(memberIdInt) || isNaN(amountFloat) || amountFloat <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid input: Member ID must be a number and amount must be a positive number.' });
  }

  try {
    const member = await prisma.member.findUnique({ where: { id: memberIdInt } });
    if (!member) {
      return res.status(404).json({ success: false, message: `Member with ID ${memberIdInt} not found.` });
    }

    const result = await prisma.$transaction(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: { memberId: memberIdInt },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            memberId: memberIdInt,
            balance: 0.0,
            currency: 'INR',
          },
        });
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amountFloat } },
      });

      // Add funds directly creates a COMPLETED transaction
      const transaction = await tx.transaction.create({
        data: {
          wallet: { connect: { id: updatedWallet.id } },
          type: 'CREDIT',
          amount: amountFloat,
          status: TransactionStatus.PAID, // Admin direct topup, considered paid
          paymentMethod,
          referenceNumber,
          notes,
          processedByAdmin: { connect: { id: adminId } }, // Admin performing the action
        },
      });
      return { updatedWallet, transaction };
    });

    res.status(200).json({
      success: true,
      message: `Successfully added ${amountFloat} to member ${memberIdInt}'s wallet. New balance: ${result.updatedWallet.balance}`,
      data: {
        wallet: result.updatedWallet,
        transaction: result.transaction,
      },
    });
  } catch (error) {
    console.error(`Error adding funds to member ${memberIdInt}'s wallet:`, error);
    next(error);
  }
};

/**
 * @desc    Approve a pending wallet transaction
 * @route   POST /api/admin/wallets/transactions/:transactionId/approve
 * @access  Private/Admin
 */
exports.approveWalletTransaction = async (req, res, next) => {
  const { transactionId } = req.params;
  // Admin might provide these details upon approval
  const { paymentMethod, referenceNumber, notes } = req.body; 
  const adminUserId = req.user?.id; // Admin's user ID from auth middleware

  if (!adminUserId) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Admin ID not found.' });
  }

  const transactionIdInt = parseInt(transactionId);
  if (isNaN(transactionIdInt)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction ID.' });
  }

  // Basic validation for payment details if provided
  // Allow approval even if paymentMethod is not provided, it can be optional if already set or not applicable
  // if (paymentMethod && paymentMethod !== 'CASH' && !referenceNumber) { 
  //   return res.status(400).json({ success: false, message: 'Reference number is required for non-cash payment methods.' });
  // }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch the transaction to be approved
      const pendingTransaction = await tx.transaction.findUnique({
        where: { id: transactionIdInt },
      });

      if (!pendingTransaction) {
        throw { statusCode: 404, message: 'Transaction not found.' };
      }

      if (pendingTransaction.status !== TransactionStatus.PENDING) {
        throw { statusCode: 400, message: `Transaction is already ${pendingTransaction.status.toLowerCase()} and cannot be approved.` };
      }
      
      // Ensure the transaction is a CREDIT type for top-up approval
      // Assuming TransactionType.CREDIT is the correct enum value
      if (pendingTransaction.type !== 'CREDIT') { 
          throw { statusCode: 400, message: 'Only CREDIT transactions can be approved as top-ups.' };
      }

      // 2. Find the member associated with the transaction's userId
      const member = await tx.member.findUnique({
        where: { userId: pendingTransaction.userId }, // userId on transaction is the User's ID
      });

      if (!member) {
        throw { statusCode: 500, message: `Member profile not found for user ID ${pendingTransaction.userId} associated with the transaction.` };
      }
      const memberIdForWallet = member.id; // This is Member.id

      // 3. Find or create the wallet for the member and update its balance
      let wallet = await tx.wallet.findUnique({
        where: { memberId: memberIdForWallet },
      });

      if (!wallet) {
        // Wallet doesn't exist, create it with the transaction amount
        wallet = await tx.wallet.create({
          data: {
            memberId: memberIdForWallet,
            balance: pendingTransaction.amount, // Initial balance is the transaction amount
            currency: 'INR', // Or your default currency
          },
        });
      } else {
        // Wallet exists, increment its balance
        wallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: pendingTransaction.amount } },
        });
      }

      // 4. Update the transaction: set status to PAID, link to wallet, and set admin
      const approvedTransaction = await tx.transaction.update({
        where: { id: transactionIdInt },
        data: {
          status: TransactionStatus.PAID,
          walletId: wallet.id, // Link transaction to the wallet
          processedByAdminId: adminUserId, // Record admin who approved (schema change)
          paymentMethod: paymentMethod || pendingTransaction.paymentMethod, // Keep original if not provided by admin
          referenceNumber: referenceNumber || pendingTransaction.referenceNumber,
          notes: notes || pendingTransaction.notes,
        },
      });

      return { approvedTransaction, updatedWallet: wallet };
    });

    res.status(200).json({
      success: true,
      message: 'Transaction approved successfully.',
      data: {
        transaction: result.approvedTransaction,
        wallet: result.updatedWallet, // Return the full wallet object
      },
    });

  } catch (error) {
    console.error(`Error approving transaction ${transactionIdInt}:`, error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    // Default to 500 for other unexpected errors
    res.status(500).json({ success: false, message: 'An unexpected error occurred while approving the transaction.' });
  }
};


/**
 * @desc Remove funds from a member's wallet
 * @route POST /api/admin/wallets/:memberId/remove-funds
 * @access Private (Admin)
 */
exports.removeFundsFromWallet = async (req, res, next) => {
  const { memberId } = req.params;
  const { amount, paymentMethod, referenceNumber, notes } = req.body; // 'reason' can be part of 'notes'
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Admin ID not found. Ensure you are logged in.' });
  }

  const memberIdInt = parseInt(memberId);
  const amountFloat = parseFloat(amount);

  if (isNaN(memberIdInt) || isNaN(amountFloat) || amountFloat <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid input: Member ID must be a number and amount must be a positive number.' });
  }

  try {
    const member = await prisma.member.findUnique({ where: { id: memberIdInt } });
    if (!member) {
      return res.status(404).json({ success: false, message: `Member with ID ${memberIdInt} not found.` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { memberId: memberIdInt },
      });

      if (!wallet) {
        throw new Error('Wallet not found for this member. Cannot remove funds.');
      }

      if (wallet.balance < amountFloat) {
        throw new Error(`Insufficient funds. Current balance: ${wallet.balance}, tried to remove: ${amountFloat}.`);
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amountFloat } },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: updatedWallet.id,
          type: 'DEBIT',
          amount: amountFloat,
          paymentMethod,
          referenceNumber,
          notes,
          status: TransactionStatus.PAID, // Admin action, so transaction is paid
          processedByAdminId: adminId,    // Corrected field name
        },
      });
      return { updatedWallet, transaction };
    });

    res.status(200).json({
      success: true,
      message: `Successfully removed ${amountFloat} from member ${memberIdInt}'s wallet. New balance: ${result.updatedWallet.balance}`,
      data: {
        wallet: result.updatedWallet,
        transaction: result.transaction,
      },
    });
  } catch (error) {
    console.error(`Error removing funds from member ${memberIdInt}'s wallet:`, error);
    if (error.message.startsWith('Insufficient funds') || error.message.startsWith('Wallet not found')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc Get all transaction details
 * @route GET /api/admin/wallets/transactions
 * @access Private (Admin)
 */
exports.getAllTransactions = async (req, res, next) => {
  const { page = 1, limit = 10, type, memberId, adminId: queryAdminId, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const whereConditions = {};
  if (type) whereConditions.type = type.toUpperCase();
  if (memberId) {
    const memberWallet = await prisma.wallet.findUnique({ where: { memberId: parseInt(memberId) } });
    if (memberWallet) {
      whereConditions.walletId = memberWallet.id;
    } else {
      return res.status(200).json({ success: true, data: [], total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 });
    }
  }
  if (queryAdminId) whereConditions.adminId = parseInt(queryAdminId);

  try {
    const transactions = await prisma.transaction.findMany({
      where: whereConditions,
      include: {
        wallet: { include: { member: { select: { id: true, name: true, user: { select: { name: true, email: true } } } } } },
        admin: { select: { id: true, name: true, email: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take,
    });

    const totalTransactions = await prisma.transaction.count({ where: whereConditions });

    const formattedTransactions = transactions.map(t => ({
      id: t.id,
      memberId: t.wallet.member.id,
      memberName: t.wallet.member.user?.name || t.wallet.member.name,
      type: t.type,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      referenceNumber: t.referenceNumber,
      notes: t.notes,
      adminId: t.adminId,
      adminName: t.admin?.name,
      timestamp: t.createdAt,
      walletId: t.walletId,
    }));

    res.status(200).json({
      success: true,
      data: formattedTransactions,
      meta: {
        total: totalTransactions,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalTransactions / take),
      }
    });
  } catch (error) {
    console.error('Error fetching all transactions:', error);
    next(error);
  }
};

/**
 * @desc Get details of a specific transaction
 * @route GET /api/admin/wallets/transactions/:transactionId
 * @access Private (Admin)
 */
exports.getTransactionDetails = async (req, res, next) => {
  const { transactionId } = req.params;
  const transactionIdInt = parseInt(transactionId);

  if (isNaN(transactionIdInt)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction ID.' });
  }

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionIdInt },
      include: {
        wallet: { include: { member: { select: { id: true, name: true, user: { select: { name: true, email: true } } } } } },
        admin: { select: { id: true, name: true, email: true } },
      },
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: `Transaction with ID ${transactionIdInt} not found.` });
    }

    const formattedTransaction = {
      id: transaction.id,
      memberId: transaction.wallet.member.id,
      memberName: transaction.wallet.member.user?.name || transaction.wallet.member.name,
      type: transaction.type,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      referenceNumber: transaction.referenceNumber,
      notes: transaction.notes,
      adminId: transaction.adminId,
      adminName: transaction.admin?.name,
      timestamp: transaction.createdAt,
      walletId: transaction.walletId,
    };

    res.status(200).json({ success: true, data: formattedTransaction });
  } catch (error) {
    console.error(`Error fetching details for transaction ${transactionIdInt}:`, error);
    next(error);
  }
};
