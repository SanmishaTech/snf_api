const { PrismaClient, TransactionType, TransactionStatus } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Credit amount to member's wallet when order is skipped by customer
 * @param {number} memberId - Member ID
 * @param {number} amount - Amount to credit
 * @param {string} referenceNumber - Reference number (delivery ID or order ID)
 * @param {string} notes - Notes about the transaction
 * @param {number} processedByAdminId - Admin who processed the credit (optional)
 * @returns {Promise<WalletTransaction>}
 */
const creditWallet = async (memberId, amount, referenceNumber, notes, processedByAdminId = null) => {
  try {
    return await prisma.$transaction(async (tx) => {
      // Create wallet transaction
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          memberId: memberId,
          amount: amount,
          type: TransactionType.CREDIT,
          status: TransactionStatus.PAID, // Auto-approve system credits
          paymentMethod: 'SYSTEM_CREDIT',
          referenceNumber: referenceNumber,
          notes: notes,
          processedByAdminId: processedByAdminId,
        }
      });

      // Update member's wallet balance
      await tx.member.update({
        where: { id: memberId },
        data: {
          walletBalance: {
            increment: amount
          }
        }
      });

      return walletTransaction;
    });
  } catch (error) {
    console.error('Error crediting wallet:', error);
    throw new Error(`Failed to credit wallet: ${error.message}`);
  }
};

/**
 * Calculate refund amount for a delivery schedule entry
 * Uses subscription rate and delivery quantity for accurate refund calculation
 * @param {Object} deliveryEntry - Delivery schedule entry with subscription details
 * @returns {number} Amount to refund
 */
const calculateRefundAmount = (deliveryEntry) => {
  if (!deliveryEntry.subscription) {
    console.warn('calculateRefundAmount: No subscription data found in delivery entry');
    return 0;
  }

  const { rate } = deliveryEntry.subscription;
  const { quantity } = deliveryEntry;
  
  // Use the subscription rate (unit price) and delivery quantity
  if (rate && quantity && rate > 0 && quantity > 0) {
    const refundAmount = parseFloat(rate) * parseInt(quantity);
    console.log(`calculateRefundAmount: rate=${rate}, quantity=${quantity}, refund=${refundAmount}`);
    return refundAmount;
  }
  
  console.warn('calculateRefundAmount: Invalid rate or quantity values', { rate, quantity });
  return 0;
};

module.exports = {
  creditWallet,
  calculateRefundAmount
};
