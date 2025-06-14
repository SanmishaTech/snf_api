/**
 * @swagger
 * tags:
 *   name: DeliverySchedules
 *   description: Delivery schedule management for agencies and admins.
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     DeliveryStatusEnum:
 *       type: string
 *       enum: [PENDING, DELIVERED, NOT_DELIVERED, CANCELLED]
 *       description: Current status of the delivery.
 *       example: DELIVERED
 *
 *     SimpleProductInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: "Milk Packet"
 *         unit:
 *           type: string
 *           nullable: true
 *           example: "500ml"
 *
 *     SimpleUserInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 101
 *         name:
 *           type: string
 *           example: "John Member"
 *         email:
 *           type: string
 *           format: email
 *           example: "john.member@example.com"
 *
 *     SimpleMemberInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 11
 *         name:
 *           type: string
 *           example: "John Member"
 *         user:
 *           $ref: '#/components/schemas/SimpleUserInfo'
 *
 *     SimpleDeliveryAddressInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         recipientName:
 *           type: string
 *           example: "John Doe"
 *         mobile:
 *           type: string
 *           example: "9876543210"
 *         plotBuilding:
 *           type: string
 *           example: "Apt 101, Sunshine Apartments"
 *         streetArea:
 *           type: string
 *           example: "Main Street, Green Valley"
 *         landmark:
 *           type: string
 *           nullable: true
 *           example: "Near City Park"
 *         pincode:
 *           type: string
 *           example: "500001"
 *         city:
 *           type: string
 *           example: "Hyderabad"
 *         state:
 *           type: string
 *           example: "Telangana"
 *         label:
 *           type: string
 *           nullable: true
 *           example: "Home"
 *
 *     SimpleSubscriptionInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         # Add other relevant subscription fields if needed by frontend
 *
 *     DeliveryScheduleEntryCore:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the delivery schedule entry.
 *           example: 123
 *         deliveryDate:
 *           type: string
 *           format: date-time
 *           description: The scheduled date and time of delivery.
 *           example: "2024-07-15T00:00:00.000Z"
 *         status:
 *           $ref: '#/components/schemas/DeliveryStatusEnum'
 *         quantity:
 *           type: integer
 *           description: Quantity of the product to be delivered.
 *           example: 2
 *         notes:
 *           type: string
 *           nullable: true
 *           description: Any notes for the delivery.
 *           example: "Leave at front door."
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of when the entry was created.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of the last update.
 *
 *     DeliveryScheduleEntryDetailedResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/DeliveryScheduleEntryCore'
 *         - type: object
 *           properties:
 *             product:
 *               $ref: '#/components/schemas/SimpleProductInfo'
 *             member:
 *               $ref: '#/components/schemas/SimpleMemberInfo'
 *             deliveryAddress:
 *               $ref: '#/components/schemas/SimpleDeliveryAddressInfo'
 *             subscription:
 *               $ref: '#/components/schemas/SimpleSubscriptionInfo'
 *               description: "Subscription details. Note: This might not be present in all responses (e.g., after an update operation)."
 *               nullable: true
 *
 *     UpdateDeliveryStatusRequest:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           $ref: '#/components/schemas/DeliveryStatusEnum'
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message.
 *         details:
 *           type: string
 *           nullable: true
 *           description: Additional error details.
 *       example:
 *         error: "Invalid input"
 *         details: "Date parameter is required"
 *
 *     NotFoundResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *       example:
 *         message: "No deliveries found for this agency on the specified date."
 */

const express = require('express');
const router = express.Router();
const { getAgencyDeliveriesByDate, updateDeliveryStatus } = require('../controllers/deliveryScheduleController');

const auth = require('../middleware/auth'); // Using the actual authentication middleware

const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Authentication required. User not found.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: You do not have the necessary permissions.' });
        }
        // For AGENCY role, ensure agencyId is present
        if (req.user.role === 'AGENCY' && !req.user.agencyId) {
            return res.status(403).json({ error: 'Forbidden: Agency user must have an associated agencyId.' });
        }
        next();
    };
};

/**
 * @swagger
 * /delivery-schedules/agency/by-date:
 *   get:
 *     summary: Get deliveries for an agency by date.
 *     description: >
 *       Retrieves a list of delivery schedule entries for a specific agency on a given date.
 *       AGENCY role users will get deliveries for their own agency.
 *       ADMIN role users must provide an `agencyId` query parameter to specify the agency.
 *     tags: [DeliverySchedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: The date to fetch deliveries for (YYYY-MM-DD).
 *         example: "2024-07-15"
 *       - in: query
 *         name: agencyId
 *         schema:
 *           type: integer
 *         required: false
 *         description: ID of the agency (Required for ADMIN users).
 *         example: 1
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PAID] # Add other statuses if applicable
 *         required: false
 *         description: Filter by subscription payment status.
 *         example: "PAID"
 *     responses:
 *       200:
 *         description: A list of delivery schedule entries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DeliveryScheduleEntryDetailedResponse'
 *       400:
 *         description: Bad Request (e.g., missing date, invalid date format, missing agencyId for admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized (Missing or invalid JWT token).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden (User role not permitted, or agency user not associated with an agencyId).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found (e.g., no deliveries found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundResponse'
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/agency/by-date', auth, getAgencyDeliveriesByDate);

/**
 * @swagger
 * /delivery-schedules/{id}/status:
 *   put:
 *     summary: Update the status of a delivery schedule entry.
 *     description: >
 *       Allows an AGENCY user to update the status of a specific delivery schedule entry.
 *       ADMIN users are not permitted to use this endpoint.
 *       The agency user must be associated with the agency to which the delivery entry belongs.
 *     tags: [DeliverySchedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The ID of the delivery schedule entry to update.
 *         example: 123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateDeliveryStatusRequest'
 *     responses:
 *       200:
 *         description: Delivery status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryScheduleEntryDetailedResponse'
 *       400:
 *         description: Bad Request (e.g., invalid status value).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized (Missing or invalid JWT token).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden (User role not permitted, or agency user not authorized for this entry).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not Found (Delivery entry not found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:id/status', auth, updateDeliveryStatus);

module.exports = router;
