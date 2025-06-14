const express = require('express');
const router = express.Router();

// Assuming authMiddleware correctly extracts user from token and attaches to req.user
const authMiddleware  = require('../middleware/auth'); // Removed authorize as it's not used yet
const { 
    getUserWallet, 
    createTopUpRequest, 
    getCurrentBalance 
} = require('../controllers/walletController');

// Swagger documentation
/**
 * @swagger
 * tags:
 *   name: Wallet (Member)
 *   description: Member wallet operations
 */

/**
 * @swagger
 * /api/wallet:
 *   get:
 *     summary: Get current member's wallet, including transaction history
 *     tags: [Wallet (Member)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved wallet details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object # Define this based on getUserWallet's actual response
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Wallet not found.
 */
router.route('/')
    .get(authMiddleware, getUserWallet); // Existing route for detailed wallet view

/**
 * @swagger
 * /api/wallet/transactions:
 *   post:
 *     summary: Create a new top-up request (transaction will be PENDING)
 *     tags: [Wallet (Member)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 format: float
 *                 description: The amount to top-up.
 *                 example: 50.00
 *     responses:
 *       201:
 *         description: Top-up request created successfully. Transaction is PENDING.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transaction'
 *       400:
 *         description: Invalid input (e.g., non-positive amount).
 *       401:
 *         description: Unauthorized.
 */
router.route('/transactions')
    .post(authMiddleware, createTopUpRequest);

/**
 * @swagger
 * /api/wallet/balance:
 *   get:
 *     summary: Get current member's wallet balance
 *     tags: [Wallet (Member)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved wallet balance.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     balance:
 *                       type: number
 *                       format: float
 *                     currency:
 *                       type: string
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Member profile or wallet not found.
 */
router.route('/balance')
    .get(authMiddleware, getCurrentBalance);

module.exports = router;

// Add this to your main Swagger definition file or a shared components file:
/**
 * @swagger
 * components:
 *   schemas:
 *     Transaction:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Transaction ID.
 *         userId:
 *           type: integer
 *           nullable: true
 *           description: ID of the user who initiated the transaction (if applicable).
 *         memberId:
 *           type: integer
 *           description: ID of the member whose wallet balance changed.
 *         amount:
 *           type: number
 *           format: float
 *           description: Transaction amount.
 *         type:
 *           type: string
 *           enum: [CREDIT, DEBIT]
 *           description: Type of transaction.
 *         status:
 *           type: string
 *           enum: [PENDING, PAID, FAILED]
 *           description: Status of the transaction.
 *         paymentMethod:
 *           type: string
 *           nullable: true
 *         referenceNumber:
 *           type: string
 *           nullable: true
 *         notes:
 *           type: string
 *           nullable: true
 *         processedByAdminId:
 *           type: integer
 *           nullable: true
 *           description: ID of the admin who processed the transaction (if applicable).
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */
