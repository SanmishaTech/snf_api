const { PrismaClient, TransactionStatus, TransactionType } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * @desc Get all member wallet balances
 * @route GET /api/admin/wallets
 * @access Private (Admin)
 */
exports.getMemberWallets = async (req, res, next) => {
  try {
    const members = await prisma.member.findMany({
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    const memberWallets = members.map(member => ({
      memberId: member.id,
      memberName: member.user?.name || member.name,
      memberEmail: member.user?.email,
      balance: member.walletBalance,
    }));

    res.status(200).json({ success: true, data: memberWallets });
  } catch (error) {
    console.error('Error fetching member wallets:', error);
    next(error);
  }
};

exports.getMemberTransactions = async (req, res, next) => {
  const { memberId } = req.params;
  const memberIdInt = parseInt(memberId);

  if (isNaN(memberIdInt)) {
    return res.status(400).json({ success: false, message: 'Invalid member ID.' });
  }

  const {
    page = 1,
    limit = 10,
    search = '',
    type,
    status,
    paymentMethod,
    fromDate,
    toDate,
  } = req.query;

  const parsedPage = parseInt(page);
  const parsedLimit = parseInt(limit);
  const pageInt = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const limitInt = Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : 10;
  const skip = (pageInt - 1) * limitInt;

  const whereConditions = {
    memberId: memberIdInt,
  };

  if (type) whereConditions.type = String(type).toUpperCase();
  if (status) whereConditions.status = String(status).toUpperCase();
  if (paymentMethod) whereConditions.paymentMethod = String(paymentMethod);

  if (fromDate || toDate) {
    whereConditions.createdAt = {};
    if (fromDate) whereConditions.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      whereConditions.createdAt.lte = end;
    }
  }

  const q = String(search || '').trim();
  if (q) {
    whereConditions.OR = [
      { paymentMethod: { contains: q } },
      { referenceNumber: { contains: q } },
      { notes: { contains: q } },
      { processedByAdmin: { is: { name: { contains: q } } } },
      { processedByAdmin: { is: { email: { contains: q } } } },
    ];
  }

  try {
    const [transactions, total, paymentMethods] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereConditions,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitInt,
        include: {
          processedByAdmin: { select: { name: true, email: true } },
        },
      }),
      prisma.walletTransaction.count({ where: whereConditions }),
      prisma.walletTransaction.findMany({
        where: { memberId: memberIdInt },
        distinct: ['paymentMethod'],
        select: { paymentMethod: true },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          status: t.status,
          paymentMethod: t.paymentMethod,
          referenceNumber: t.referenceNumber,
          notes: t.notes,
          adminName: t.processedByAdmin?.name || 'N/A',
          timestamp: t.createdAt,
        })),
        paymentMethodOptions: paymentMethods
          .map((p) => p.paymentMethod)
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b))),
        meta: {
          total,
          page: pageInt,
          limit: limitInt,
          totalPages: Math.max(1, Math.ceil(total / limitInt)),
        },
      },
    });
  } catch (error) {
    console.error(`Error fetching transactions for member ${memberIdInt}:`, error);
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
  const includeTransactions = String(req.query?.includeTransactions ?? 'true') !== 'false';

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

    let transactionsCombined = [];
    if (includeTransactions) {
      const transactions = await prisma.walletTransaction.findMany({
        where: { memberId: memberIdInt },
        orderBy: { createdAt: 'desc' },
        include: {
          processedByAdmin: { select: { name: true, email: true } },
        },
      });

      let pendingUserTransactions = [];
      if (member.userId) {
        pendingUserTransactions = await prisma.walletTransaction.findMany({
          where: {
            memberId: memberIdInt,
            status: TransactionStatus.PENDING,
            type: TransactionType.CREDIT,
          },
          orderBy: { createdAt: 'desc' },
          include: { processedByAdmin: { select: { name: true, email: true } } },
        });
      }

      transactionsCombined = [...transactions, ...pendingUserTransactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const walletDetails = {
      balance: member.walletBalance,
      transactions: transactionsCombined.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        status: t.status, 
        paymentMethod: t.paymentMethod,
        referenceNumber: t.referenceNumber,
        notes: t.notes,
        adminName: t.processedByAdmin?.name || 'N/A',
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
      const updatedMember = await tx.member.update({
        where: { id: memberIdInt },
        data: { walletBalance: { increment: amountFloat } },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          memberId: memberIdInt,
          type: 'CREDIT',
          amount: amountFloat,
          status: TransactionStatus.PAID,
          paymentMethod,
          referenceNumber,
          notes,
          processedByAdminId: adminId,
        },
      });
      return { updatedMember, transaction };
    });

    res.status(200).json({
      success: true,
      message: `Successfully added ${amountFloat} to member ${memberIdInt}'s wallet. New balance: ${result.updatedMember.walletBalance}`,
      data: {
        balance: result.updatedMember.walletBalance,
        transaction: result.transaction,
      },
    });
  } catch (error) {
    console.error(`Error adding funds to member ${memberIdInt}'s wallet:`, error);
    next(error);
  }
};

/**
 * @desc Approve a pending wallet transaction
 * @route POST /api/admin/wallets/transactions/:transactionId/approve
 * @access Private/Admin
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
      const pendingTransaction = await tx.walletTransaction.findUnique({
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

      // 2. Find the member associated with the transaction's memberId
      const member = await tx.member.findUnique({
        where: { id: pendingTransaction.memberId }, 
      });

      if (!member) {
        throw { statusCode: 500, message: `Member profile not found for member ID ${pendingTransaction.memberId} associated with the transaction.` };
      }
      const memberIdForWallet = member.id; // This is Member.id

      // 3. Update the member's wallet balance
      const updatedMember = await tx.member.update({
        where: { id: memberIdForWallet },
        data: { walletBalance: { increment: pendingTransaction.amount } },
      });

      // 4. Update the transaction: set status to PAID, and set admin
      const approvedTransaction = await tx.walletTransaction.update({
        where: { id: transactionIdInt },
        data: {
          status: TransactionStatus.PAID,
          processedByAdminId: adminUserId, // Record admin who approved (schema change)
          paymentMethod: paymentMethod || pendingTransaction.paymentMethod, // Keep original if not provided by admin
          referenceNumber: referenceNumber || pendingTransaction.referenceNumber,
          notes: notes || pendingTransaction.notes,
        },
      });

      return { approvedTransaction, updatedMember };
    });

    res.status(200).json({
      success: true,
      message: 'Transaction approved successfully.',
      data: {
        transaction: result.approvedTransaction,
        balance: result.updatedMember.walletBalance, // Return the full wallet object
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
      const memberRecord = await tx.member.findUnique({ where: { id: memberIdInt } });
      if (memberRecord.walletBalance < amountFloat) {
        throw new Error(`Insufficient funds. Current balance: ${memberRecord.walletBalance}, tried to remove: ${amountFloat}.`);
      }

      const updatedMember = await tx.member.update({
        where: { id: memberIdInt },
        data: { walletBalance: { decrement: amountFloat } },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          memberId: memberIdInt,
          type: 'DEBIT',
          amount: amountFloat,
          status: TransactionStatus.PAID,
          paymentMethod,
          referenceNumber,
          notes,
          processedByAdminId: adminId,
        },
      });
      return { updatedMember, transaction };
    });

    res.status(200).json({
      success: true,
      message: `Successfully removed ${amountFloat} from member ${memberIdInt}'s wallet. New balance: ${result.updatedMember.walletBalance}`,
      data: {
        balance: result.updatedMember.walletBalance,
        transaction: result.transaction,
      },
    });
  } catch (error) {
    console.error(`Error removing funds from member ${memberIdInt}'s wallet:`, error);
    if (error.message.startsWith('Insufficient funds')) {
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
    whereConditions.memberId = parseInt(memberId);
  }
  if (queryAdminId) whereConditions.processedByAdminId = parseInt(queryAdminId);

  try {
    const transactions = await prisma.walletTransaction.findMany({
      where: whereConditions,
      include: {
        member: { select: { id: true, name: true, user: { select: { name: true, email: true } } } },
        processedByAdmin: { select: { id: true, name: true, email: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take,
    });

    const totalTransactions = await prisma.walletTransaction.count({ where: whereConditions });

    const formattedTransactions = transactions.map(t => ({
      id: t.id,
      memberId: t.memberId,
      memberName: t.member.user?.name || t.member.name,
      type: t.type,
      amount: t.amount,
      paymentMethod: t.paymentMethod,
      referenceNumber: t.referenceNumber,
      notes: t.notes,
      adminId: t.processedByAdminId,
      adminName: t.processedByAdmin?.name,
      timestamp: t.createdAt,
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
    const transaction = await prisma.walletTransaction.findUnique({
      where: { id: transactionIdInt },
      include: {
        member: { select: { id: true, name: true, user: { select: { name: true, email: true } } } },
        processedByAdmin: { select: { id: true, name: true, email: true } },
      },
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: `Transaction with ID ${transactionIdInt} not found.` });
    }

    const formattedTransaction = {
      id: transaction.id,
      memberId: transaction.memberId,
      memberName: transaction.member.user?.name || transaction.member.name,
      type: transaction.type,
      amount: transaction.amount,
      paymentMethod: transaction.paymentMethod,
      referenceNumber: transaction.referenceNumber,
      notes: transaction.notes,
      adminId: transaction.processedByAdminId,
      adminName: transaction.processedByAdmin?.name,
      timestamp: transaction.createdAt,
    };

    res.status(200).json({ success: true, data: formattedTransaction });
  } catch (error) {
    console.error(`Error fetching details for transaction ${transactionIdInt}:`, error);
    next(error);
  }
};
