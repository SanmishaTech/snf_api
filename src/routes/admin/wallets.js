const express = require('express');
const router = express.Router();
const {
    getMemberWallets,
    getMemberWalletDetails,
    addFundsToWallet,
    removeFundsFromWallet,
    getAllTransactions,
    getTransactionDetails
} = require('../../controllers/admin/walletsController');
const { getUserWallet } = require('../../controllers/walletController'); // Assuming this is for user-facing wallet
const { approveWalletTransaction } = require('../../controllers/admin/walletsController'); // For admin actions


// Assuming you have an auth middleware, e.g., protect and authorize (admin)
const authMiddleware = require('../../middleware/auth');

// All routes here will be prefixed with /api/admin/wallets (defined in main app.js or index.js)

/**
 * @swagger
 * tags:
 *   name: AdminWallets
 *   description: Wallet management for administrators
 */

/**
 * @swagger
 * /admin/wallets:
 *   get:
 *     summary: Get all member wallet balances
 *     tags: [AdminWallets]
 *     responses:
 *       200:
 *         description: A list of member wallets
 */
router.route('/')
    // .get(protect, authorize('admin'), getMemberWallets);
    .get(authMiddleware, getMemberWallets);

/**
 * @swagger
 * /admin/wallets/transactions:
 *   get:
 *     summary: Get all transaction details
 *     tags: [AdminWallets]
 *     responses:
 *       200:
 *         description: A list of all transactions
 */
router.route('/transactions')
    // .get(protect, authorize('admin'), getAllTransactions);
    .get(authMiddleware, getAllTransactions);

/**
 * @swagger
 * /admin/wallets/transactions/{transactionId}:
 *   get:
 *     summary: Get details of a specific transaction
 *     tags: [AdminWallets]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the transaction
 *     responses:
 *       200:
 *         description: Transaction details
 */
router.route('/transactions/:transactionId')
    // .get(protect, authorize('admin'), getTransactionDetails);
    .get(authMiddleware, getTransactionDetails);

/**
 * @swagger
 * /admin/wallets/{memberId}:
 *   get:
 *     summary: Get a specific member's wallet balance and transaction history
 *     tags: [AdminWallets]
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the member
 *     responses:
 *       200:
 *         description: Member wallet details
 */
router.route('/:memberId')
    // .get(protect, authorize('admin'), getMemberWalletDetails);
    .get(authMiddleware, getMemberWalletDetails);

/**
 * @swagger
 * /admin/wallets/{memberId}/add-funds:
 *   post:
 *     summary: Add funds to a member's wallet
 *     tags: [AdminWallets]
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the member
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               paymentMethod:
 *                 type: string
 *               referenceNumber:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Funds added successfully
 */
router.route('/:memberId/add-funds')
    // .post(protect, authorize('admin'), addFundsToWallet);
    .post(authMiddleware, addFundsToWallet);

/**
 * @swagger
 * /admin/wallets/{memberId}/remove-funds:
 *   post:
 *     summary: Remove funds from a member's wallet
 *     tags: [AdminWallets]
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the member
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *               referenceNumber:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Funds removed successfully
 */
router.route('/:memberId/remove-funds')
    // .post(protect, authorize('admin'), removeFundsFromWallet);
    .post(authMiddleware, removeFundsFromWallet);

// Admin route to approve a transaction
router.route('/transactions/:transactionId/approve')
    .post(authMiddleware, approveWalletTransaction);


module.exports = router;

