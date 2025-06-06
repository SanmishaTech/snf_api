// backend/src/routes/admin/members.js
const express = require('express');
const router = express.Router();
const {
    getAllMembersWithWallets
} = require('../../controllers/admin/membersController');

// Assuming you have an auth middleware, e.g., protect and authorize (admin)
const authMiddleware = require('../../middleware/auth'); // Path to your auth middleware

// All routes here will be prefixed with /api/admin/members (defined in main app.js or index.js)

/**
 * @swagger
 * tags:
 *   name: AdminMembers
 *   description: Member information for administrators
 */

/**
 * @swagger
 * /admin/members:
 *   get:
 *     summary: Get all members with their wallet balances
 *     tags: [AdminMembers]
 *     security:
 *       - bearerAuth: [] # Assuming you use Bearer token for auth
 *     responses:
 *       200:
 *         description: A list of members with their wallet information
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     description: Member ID
 *                   name:
 *                     type: string
 *                     description: Member's name
 *                   email:
 *                     type: string
 *                     description: Member's email
 *                   walletBalance:
 *                     type: number
 *                     description: Member's wallet balance
 *                   hasWallet:
 *                      type: boolean
 *                      description: Indicates if the member has a wallet setup
 *       401:
 *         description: Unauthorized, token missing or invalid
 *       403:
 *         description: Forbidden, user is not an admin
 *       404:
 *         description: No members found
 *       500:
 *         description: Server error
 */
router.route('/')
    .get(authMiddleware, getAllMembersWithWallets); // Apply auth middleware

module.exports = router;
