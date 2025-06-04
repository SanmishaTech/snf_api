/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     SubscriptionStatusEnum:
 *       type: string
 *       enum: [ACTIVE, INACTIVE, CANCELLED, EXPIRED, PENDING_PAYMENT, PAUSED, PENDING_APPROVAL]
 *       description: Status of the subscription.
 *       example: ACTIVE
 *     DeliveryScheduleEnum:
 *       type: string
 *       enum: [DAILY, WEEKDAYS, ALTERNATE_DAYS, SELECT_DAYS, VARYING]
 *       description: >
 *         Pattern of delivery for the subscription.
 *         - `DAILY`: Delivery every day.
 *         - `WEEKDAYS`: Delivery on all weekdays (Mon-Fri). Backend may interpret as SELECT_DAYS with Mon-Fri pre-selected.
 *         - `ALTERNATE_DAYS`: Delivery on alternate days (e.g., Day 1, Day 3, Day 5).
 *         - `SELECT_DAYS`: Delivery on specific user-selected weekdays (requires `weekdays` array).
 *         - `VARYING`: Delivery every day, but quantity alternates between `qty` and `altQty` (requires `altQty`).
 *       example: DAILY
 *     PaymentModeEnum:
 *       type: string
 *       enum: [ONLINE, CASH, UPI, BANK]
 *       description: Mode of payment for the subscription.
 *       example: ONLINE
 *     PaymentStatusEnum:
 *       type: string
 *       enum: [PENDING, PAID, FAILED]
 *       description: Status of the payment for the subscription.
 *       example: PAID
 *     WeekdaysArray:
 *       type: array
 *       items:
 *         type: string
 *         enum: [sun, mon, tue, wed, thu, fri, sat]
 *       description: Array of selected weekdays (e.g., ["mon", "fri"]) for SELECT_DAYS schedule type.
 *       example: ["mon", "wed", "fri"]
 *
 *     SimpleProductInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 101
 *         name:
 *           type: string
 *           example: "Cow Milk - 1L"
 *         price:
 *           type: number
 *           format: float
 *           example: 55.00
 *     SimpleDeliveryAddressInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 201
 *         recipientName:
 *           type: string
 *           example: "Jane Doe"
 *         plotBuilding:
 *           type: string
 *           example: "Apt 101, Sunshine Apartments"
 *         streetArea:
 *           type: string
 *           example: "Main Street"
 *         city:
 *           type: string
 *           example: "Metropolis"
 *         pincode:
 *           type: string
 *           example: "123456"
 *     SimpleAgencyInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 301
 *         name:
 *           type: string
 *           example: "City Wide Deliveries"
 *         user:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: "City Wide Deliveries Contact"
 *     SimpleMemberInfo:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 401
 *         name:
 *           type: string
 *           example: "John Member"
 *         user:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               example: "john.member@example.com"
 *
 *     SubscriptionCore:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Unique identifier for the subscription.
 *           example: 123
 *         memberId:
 *           type: integer
 *           description: ID of the member who owns the subscription.
 *           example: 401
 *         deliveryAddressId:
 *           type: integer
 *           description: ID of the delivery address for the subscription.
 *           example: 201
 *         productId:
 *           type: integer
 *           description: ID of the product being subscribed to.
 *           example: 101
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: The date when the subscription effectively starts.
 *           example: "2024-07-01T00:00:00.000Z"
 *         period:
 *           type: integer
 *           description: Duration of the subscription in days.
 *           example: 30
 *         expiryDate:
 *           type: string
 *           format: date-time
 *           description: The date when the subscription expires.
 *           example: "2024-07-30T23:59:59.999Z"
 *         deliverySchedule:
 *           $ref: '#/components/schemas/DeliveryScheduleEnum'
 *         weekdays:
 *           $ref: '#/components/schemas/WeekdaysArray'
 *           nullable: true
 *           description: Required if deliverySchedule is SELECT_DAYS.
 *         qty:
 *           type: integer
 *           description: Primary quantity of the product per delivery.
 *           example: 1
 *         altQty:
 *           type: integer
 *           nullable: true
 *           description: Alternate quantity for VARYING or ALTERNATE_DAYS (with varying quantity) schedules.
 *           example: 2
 *         rate:
 *           type: number
 *           format: float
 *           description: Price per unit of the product at the time of subscription.
 *           example: 50.00
 *         totalQty:
 *           type: integer
 *           description: Total quantity to be delivered over the subscription period (calculated).
 *           example: 30
 *         amount:
 *           type: number
 *           format: float
 *           description: Total amount for the subscription (rate * totalQty, calculated).
 *           example: 1500.00
 *         paymentMode:
 *           $ref: '#/components/schemas/PaymentModeEnum'
 *           nullable: true
 *         paymentReferenceNo:
 *           type: string
 *           nullable: true
 *           description: Reference number for the payment (e.g., transaction ID).
 *           example: "txn_123abc456def"
 *         paymentDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Date of payment.
 *           example: "2024-07-01T10:00:00.000Z"
 *         paymentStatus:
 *           $ref: '#/components/schemas/PaymentStatusEnum'
 *         agencyId:
 *           type: integer
 *           nullable: true
 *           description: ID of the agency assigned for fulfillment.
 *           example: 301
 *         status:
 *           $ref: '#/components/schemas/SubscriptionStatusEnum'
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of creation.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of last update.
 *
 *     SubscriptionDetailedResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/SubscriptionCore'
 *         - type: object
 *           properties:
 *             product:
 *               $ref: '#/components/schemas/SimpleProductInfo'
 *             deliveryAddress:
 *               $ref: '#/components/schemas/SimpleDeliveryAddressInfo'
 *             agency:
 *               $ref: '#/components/schemas/SimpleAgencyInfo'
 *               nullable: true
 *             member:
 *               $ref: '#/components/schemas/SimpleMemberInfo'
 *
 *     CreateSubscriptionRequest:
 *       type: object
 *       required:
 *         - productId
 *         - deliveryAddressId
 *         - period
 *         - deliverySchedule
 *         - qty
 *         - startDate
 *       properties:
 *         productId:
 *           type: integer
 *           example: 101
 *         deliveryAddressId:
 *           type: integer
 *           example: 201
 *         period:
 *           type: integer
 *           description: Duration of the subscription in days.
 *           example: 30
 *         deliverySchedule:
 *           type: string
 *           description: "Use 'SELECT-DAYS' for specific days, 'DAILY', 'VARYING', 'ALTERNATE-DAYS'. Note: Frontend might send 'SELECT-DAYS', 'DAILY', 'VARYING'. Backend maps 'WEEKDAYS' from Prisma to 'SELECT_DAYS' if weekdays are provided."
 *           enum: [DAILY, SELECT-DAYS, VARYING, ALTERNATE-DAYS, WEEKDAYS]
 *           example: "DAILY"
 *         weekdays:
 *           $ref: '#/components/schemas/WeekdaysArray'
 *           description: Required if deliverySchedule is 'SELECT-DAYS'.
 *         qty:
 *           type: integer
 *           example: 1
 *         altQty:
 *           type: integer
 *           nullable: true
 *           example: 2
 *         startDate:
 *           type: string
 *           format: date
 *           description: Start date of the subscription (YYYY-MM-DD).
 *           example: "2024-08-01"
 *         paymentMode:
 *           $ref: '#/components/schemas/PaymentModeEnum' # Note: Controller does not seem to use this on create
 *         paymentReferenceNo:
 *           type: string # Note: Controller does not seem to use this on create
 *           nullable: true
 *
 *     UpdateSubscriptionRequest:
 *       type: object
 *       description: Fields that can be updated for a subscription. Currently limited to payment and agency details by the controller.
 *       properties:
 *         paymentMode:
 *           $ref: '#/components/schemas/PaymentModeEnum'
 *           nullable: true
 *         paymentReference:
 *           type: string
 *           nullable: true
 *           description: Payment reference number (maps to paymentReferenceNo in DB).
 *           example: "txn_789ghi012jkl"
 *         paymentDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2024-07-15T14:30:00.000Z"
 *         paymentStatus:
 *           $ref: '#/components/schemas/PaymentStatusEnum'
 *           nullable: true
 *         agencyId:
 *           type: integer
 *           nullable: true
 *           example: 302
 *         deliveryAddressId:
 *           type: integer
 *           description: Not currently updatable via this endpoint's controller logic.
 *         qty:
 *           type: integer
 *           description: Not currently updatable via this endpoint's controller logic.
 *         altQty:
 *           type: integer
 *           nullable: true
 *           description: Not currently updatable via this endpoint's controller logic.
 *
 *     RenewSubscriptionRequest:
 *       type: object
 *       properties:
 *         paymentReferenceNo:
 *           type: string
 *           nullable: true
 *           description: Optional payment reference for the renewal.
 *           example: "txn_renew_123"
 *         period:
 *           type: integer
 *           description: "Optional: Number of days for the new subscription period. If not provided, controller uses existing subscription's period string (e.g., 'DAYS_30') which might be inconsistent with integer period in schema."
 *           example: 30
 *
 *     DeliveryScheduleByDateProductSummary:
 *       type: object
 *       properties:
 *         productId:
 *           type: integer
 *           example: 101
 *         productName:
 *           type: string
 *           example: "Cow Milk - 1L"
 *         quantity:
 *           type: integer
 *           example: 10
 *
 *     DeliveryScheduleByDateAgencySummary:
 *       type: object
 *       properties:
 *         agencyId:
 *           oneOf:
 *             - type: integer
 *             - type: string
 *           example: 301 # or "unassigned"
 *         agencyName:
 *           type: string
 *           example: "City Wide Deliveries"
 *         totalQuantity:
 *           type: integer
 *           example: 50
 *         products:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DeliveryScheduleByDateProductSummary'
 *
 *     DeliveryScheduleByDateResponse:
 *       type: object
 *       properties:
 *         date:
 *           type: string
 *           format: date
 *           example: "2024-07-20"
 *         agencies:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/DeliveryScheduleByDateAgencySummary'
 *
 *     ErrorResponse400:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Invalid input: XYZ is required."
 *     ErrorResponse401:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Unauthorized: No token provided or token is invalid."
 *     ErrorResponse403:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Forbidden: You do not have permission to perform this action."
 *     ErrorResponse404:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Subscription not found."
 *     ErrorResponse500:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: "Internal Server Error."
 */

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: Subscription management operations
 */

const express = require('express');
const router = express.Router();
const {
  createSubscription,
  getSubscriptions,
  getSubscriptionById,
  updateSubscription,
  cancelSubscription,
  renewSubscription,
  getDeliveryScheduleByDate
} = require('../controllers/subscriptionController');
const authMiddleware = require('../middleware/auth');

// All routes are protected
/**
 * @swagger
 * /subscriptions:
 *   post:
 *     summary: Create a new subscription
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSubscriptionRequest'
 *     responses:
 *       201:
 *         description: Subscription created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionDetailedResponse'
 *       400:
 *         description: Bad request (e.g., validation error, member/product not found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse400'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse401'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse500'
 *   get:
 *     summary: Get all subscriptions for the current user (or all if ADMIN)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of subscriptions.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SubscriptionDetailedResponse'
 *       400:
 *         description: Bad request (e.g., member profile not found for non-admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse400'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse401'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse500'
 */
router.route('/')
  .post(authMiddleware, createSubscription)
  .get(authMiddleware, getSubscriptions);

/**
 * @swagger
 * /subscriptions/{id}:
 *   get:
 *     summary: Get a specific subscription by ID
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the subscription to retrieve.
 *         example: 123
 *     responses:
 *       200:
 *         description: Details of the subscription.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionDetailedResponse'
 *       400:
 *         description: Bad request (e.g., member profile not found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse400'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse401'
 *       403:
 *         description: Forbidden (user not authorized to access this subscription).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse403'
 *       404:
 *         description: Subscription not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse404'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse500'
 *   put:
 *     summary: Update a subscription (currently payment & agency details)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the subscription to update.
 *         example: 123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSubscriptionRequest'
 *     responses:
 *       200:
 *         description: Subscription updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionDetailedResponse'
 *       400:
 *         description: Bad request (e.g., validation error, member profile not found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse400'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse401'
 *       403:
 *         description: Forbidden (user not authorized to update this subscription).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse403'
 *       404:
 *         description: Subscription not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse404'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse500'
 */
router.route('/:id')
  .get(authMiddleware, getSubscriptionById)
  .put(authMiddleware, updateSubscription);

/**
 * @swagger
 * /subscriptions/{id}/cancel:
 *   patch:
 *     summary: Cancel a subscription
 *     description: Effectively cancels a subscription by setting its expiry date to now. No request body needed.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the subscription to cancel.
 *         example: 123
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionDetailedResponse'
 *       400:
 *         description: Bad request (e.g., member profile not found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse400'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse401'
 *       403:
 *         description: Forbidden (user not authorized to cancel this subscription).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse403'
 *       404:
 *         description: Subscription not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse404'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse500'
 */
router.patch('/:id/cancel', authMiddleware, cancelSubscription);
/**
 * @swagger
 * /subscriptions/{id}/renew:
 *   post:
 *     summary: Renew a subscription
 *     description: Creates a new subscription record based on an existing one, effectively renewing it. The period of the new subscription is determined by the controller based on the old subscription's period string (e.g., 'DAYS_30'), or can be overridden if the API is enhanced to accept a 'period' in the request body.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the subscription to renew.
 *         example: 123
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RenewSubscriptionRequest'
 *     responses:
 *       201:
 *         description: Subscription renewed successfully (new subscription created).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SubscriptionDetailedResponse'
 *       400:
 *         description: Bad request (e.g., member profile not found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse400'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse401'
 *       403:
 *         description: Forbidden (user not authorized to renew this subscription).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse403'
 *       404:
 *         description: Original subscription not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse404'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse500'
 */
router.post('/:id/renew', authMiddleware, renewSubscription);

// Route to get delivery schedule by date, grouped by agency
/**
 * @swagger
 * /subscriptions/delivery-schedule/by-date:
 *   get:
 *     summary: Get delivery schedule by date, grouped by agency (ADMIN only)
 *     description: Retrieves a summary of all product quantities to be delivered on a specific date, aggregated by agency.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: The date for which to retrieve the delivery schedule (YYYY-MM-DD).
 *         example: "2024-07-20"
 *     responses:
 *       200:
 *         description: Successfully retrieved delivery schedule data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryScheduleByDateResponse'
 *       400:
 *         description: Bad request (e.g., date parameter missing or invalid format).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse400'
 *       401:
 *         description: Unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse401'
 *       403:
 *         description: Forbidden (only ADMIN users can access this endpoint).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse403'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse500'
 */
router.get('/delivery-schedule/by-date', authMiddleware, getDeliveryScheduleByDate);

module.exports = router;
