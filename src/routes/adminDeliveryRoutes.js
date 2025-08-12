const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const adminDeliveryController = require('../controllers/admin/adminDeliveryController');

/**
 * @swagger
 * components:
 *   schemas:
 *     AdminDeliveryStatusUpdateRequest:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [PENDING, DELIVERED, NOT_DELIVERED, CANCELLED, SKIPPED, SKIP_BY_CUSTOMER, INDRAAI_DELIVERY, TRANSFER_TO_AGENT]
 *           description: New delivery status
 *         notes:
 *           type: string
 *           description: Optional admin notes about the status change
 * 
 *     AdminDeliveryResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Delivery entry ID
 *         deliveryDate:
 *           type: string
 *           format: date
 *         quantity:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [PENDING, DELIVERED, NOT_DELIVERED, CANCELLED, SKIPPED, SKIP_BY_CUSTOMER, INDRAAI_DELIVERY, TRANSFER_TO_AGENT]
 *         walletTransaction:
 *           type: object
 *           nullable: true
 *           description: Wallet transaction details if credit was processed
 *           properties:
 *             id:
 *               type: integer
 *             amount:
 *               type: number
 *               format: float
 *             type:
 *               type: string
 *               enum: [CREDIT, DEBIT]
 *             status:
 *               type: string
 *               enum: [PENDING, PAID, FAILED]
 *             notes:
 *               type: string
 *             referenceNumber:
 *               type: string
 *             createdAt:
 *               type: string
 *               format: date-time
 *         adminNotes:
 *           type: string
 *           nullable: true
 *         processedBy:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             name:
 *               type: string
 *             role:
 *               type: string
 */

// PATCH /api/admin/deliveries/:id/status - Admin update delivery status
/**
 * @swagger
 * /admin/deliveries/{id}/status:
 *   patch:
 *     summary: Update delivery status (Admin only)
 *     description: Allows admin to update delivery status including special statuses like SKIP_BY_CUSTOMER with wallet credit
 *     tags: [Admin - Deliveries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Delivery entry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminDeliveryStatusUpdateRequest'
 *     responses:
 *       200:
 *         description: Delivery status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminDeliveryResponse'
 *       400:
 *         description: Bad request (invalid status or format)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not an admin)
 *       404:
 *         description: Delivery entry not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/status', auth, isAdmin, adminDeliveryController.updateDeliveryStatus);

// GET /api/admin/deliveries - Get deliveries with admin filters
/**
 * @swagger
 * /admin/deliveries:
 *   get:
 *     summary: Get delivery entries (Admin only)
 *     description: Retrieve delivery entries with advanced filters and pagination for admin management
 *     tags: [Admin - Deliveries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by delivery date (YYYY-MM-DD)
 *       - in: query
 *         name: agencyId
 *         schema:
 *           type: integer
 *         description: Filter by agency ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, DELIVERED, NOT_DELIVERED, CANCELLED, SKIPPED, SKIP_BY_CUSTOMER, INDRAAI_DELIVERY, TRANSFER_TO_AGENT]
 *         description: Filter by delivery status
 *       - in: query
 *         name: memberId
 *         schema:
 *           type: integer
 *         description: Filter by member ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip for pagination
 *     responses:
 *       200:
 *         description: List of delivery entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deliveries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AdminDeliveryResponse'
 *                 totalCount:
 *                   type: integer
 *                   description: Total number of deliveries matching the filter
 *                 hasMore:
 *                   type: boolean
 *                   description: Whether there are more results available
 *       400:
 *         description: Bad request (invalid filters)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not an admin)
 *       500:
 *         description: Internal server error
 */
router.get('/', auth, isAdmin, adminDeliveryController.getDeliveries);

module.exports = router;
