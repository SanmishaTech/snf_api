/**
 * PhonePe Payment Controller
 *
 * Endpoints:
 *   POST   /api/phonepe/initiate         – Create a payment and get redirect URL
 *   GET    /api/phonepe/status/:id       – Check payment status
 *   POST   /api/phonepe/webhook          – Handle PhonePe webhook callbacks
 *   GET    /api/phonepe/transactions     – Admin: list all transactions
 */

const {
  initiatePayment,
  checkOrderStatus,
  processWebhook,
} = require('../services/phonePeService');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * POST /api/phonepe/initiate
 * Body: { snfOrderId?, productOrderId?, amount (in rupees), redirectUrl }
 */
exports.initiatePayment = async (req, res) => {
  try {
    const { snfOrderId, productOrderId, amount, redirectUrl } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount is required and must be > 0' });
    }
    if (!redirectUrl) {
      return res.status(400).json({ success: false, message: 'redirectUrl is required' });
    }

    // Generate a unique merchantOrderId
    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const merchantOrderId = `SNF-${snfOrderId || productOrderId || 0}-${timestamp}-${rand}`;

    const amountInPaise = Math.round(amount * 100);

    // Resolve memberId from the order
    let memberId = null;
    if (snfOrderId) {
      const order = await prisma.sNFOrder.findUnique({ where: { id: snfOrderId } });
      memberId = order?.memberId || null;
    } else if (productOrderId) {
      const order = await prisma.productOrder.findUnique({ where: { id: productOrderId } });
      memberId = order?.memberId || null;
    }

    // Append merchantOrderId to the user-supplied redirectUrl so the frontend definitively receives it.
    const finalRedirectUrl = redirectUrl.includes('?') 
      ? `${redirectUrl}&merchantOrderId=${merchantOrderId}` 
      : `${redirectUrl}?merchantOrderId=${merchantOrderId}`;

    const result = await initiatePayment({
      merchantOrderId,
      amount: amountInPaise,
      redirectUrl: finalRedirectUrl,
      snfOrderId: snfOrderId || null,
      productOrderId: productOrderId || null,
      memberId,
    });

    return res.json({
      success: true,
      data: {
        merchantOrderId: result.merchantOrderId,
        checkoutUrl: result.checkoutUrl,
        orderId: result.orderId,
      },
    });
  } catch (error) {
    console.error('[PhonePeController] initiatePayment error:', error.response?.data || error.message);
    const errMsg = error.response?.data?.message || error.message || 'Payment initiation failed';
    return res.status(500).json({ success: false, message: errMsg });
  }
};

/**
 * GET /api/phonepe/status/:merchantOrderId
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    if (!merchantOrderId) {
      return res.status(400).json({ success: false, message: 'merchantOrderId is required' });
    }

    const result = await checkOrderStatus(merchantOrderId);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[PhonePeController] getPaymentStatus error:', error.response?.data || error.message);
    const errMsg = error.response?.data?.message || error.message || 'Status check failed';
    return res.status(500).json({ success: false, message: errMsg });
  }
};

/**
 * POST /api/phonepe/webhook
 * Called by PhonePe to notify payment status changes.
 */
exports.handleWebhook = async (req, res) => {
  try {
    // Parse body — might be string (raw) or already parsed JSON
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        console.error('[PhonePeController] Webhook: could not parse body');
        return res.status(400).json({ success: false, message: 'Invalid JSON' });
      }
    }

    const result = await processWebhook(body);
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[PhonePeController] webhook error:', error.message);
    return res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

/**
 * GET /api/phonepe/transactions (Admin only)
 */
exports.listTransactions = async (req, res) => {
  try {
    const transactions = await prisma.phonePeTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        snfOrder: { select: { id: true, orderNo: true, totalAmount: true } },
        productOrder: { select: { id: true, orderNo: true, totalAmount: true } },
        member: { select: { id: true, name: true } },
      },
    });

    return res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('[PhonePeController] listTransactions error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to list transactions' });
  }
};
