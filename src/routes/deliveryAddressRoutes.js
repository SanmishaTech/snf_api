/**
 * @swagger
 * components:
 *   schemas:
 *     DeliveryAddressBase:
 *       type: object
 *       required:
 *         - recipientName
 *         - mobile
 *         - plotBuilding
 *         - streetArea
 *         - pincode
 *         - city
 *         - state
 *       properties:
 *         recipientName:
 *           type: string
 *           description: Name of the recipient.
 *           example: "John Doe"
 *         mobile:
 *           type: string
 *           description: Recipient's mobile number.
 *           example: "9876543210"
 *         plotBuilding:
 *           type: string
 *           description: Plot number, building name/number.
 *           example: "Apt 101, Sunshine Apartments"
 *         streetArea:
 *           type: string
 *           description: Street name, area/locality.
 *           example: "123 Main Street, Indiranagar"
 *         landmark:
 *           type: string
 *           nullable: true
 *           description: Nearby landmark.
 *           example: "Near MG Road Metro"
 *         pincode:
 *           type: string
 *           description: Postal Index Number (PIN code).
 *           example: "560001"
 *         city:
 *           type: string
 *           description: City name.
 *           example: "Bangalore"
 *         state:
 *           type: string
 *           description: State name.
 *           example: "Karnataka"
 *         label:
 *           type: string
 *           nullable: true
 *           description: A label for the address (e.g., Home, Work).
 *           example: "Home"
 *         isDefault:
 *           type: boolean
 *           description: Whether this is the default address for the member.
 *           default: false
 *
 *     DeliveryAddressResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/DeliveryAddressBase'
 *         - type: object
 *           properties:
 *             id:
 *               type: integer
 *               description: The auto-generated ID of the delivery address.
 *             memberId:
 *               type: integer
 *               description: ID of the member this address belongs to.
 *             createdAt:
 *               type: string
 *               format: date-time
 *               description: Timestamp of when the address was created.
 *             updatedAt:
 *               type: string
 *               format: date-time
 *               description: Timestamp of when the address was last updated.
 *
 *     DeliveryAddressCreateRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/DeliveryAddressBase'
 *
 *     DeliveryAddressUpdateRequest:
 *       type: object
 *       description: Fields for updating an existing delivery address. All fields are optional for update.
 *       properties:
 *         recipientName:
 *           type: string
 *           description: Name of the recipient.
 *           example: "John Doe"
 *         mobile:
 *           type: string
 *           description: Recipient's mobile number.
 *           example: "9876543210"
 *         plotBuilding:
 *           type: string
 *           description: Plot number, building name/number.
 *           example: "Apt 101, Sunshine Apartments"
 *         streetArea:
 *           type: string
 *           description: Street name, area/locality.
 *           example: "123 Main Street, Indiranagar"
 *         landmark:
 *           type: string
 *           nullable: true
 *           description: Nearby landmark.
 *           example: "Near MG Road Metro"
 *         pincode:
 *           type: string
 *           description: Postal Index Number (PIN code).
 *           example: "560001"
 *         city:
 *           type: string
 *           description: City name.
 *           example: "Bangalore"
 *         state:
 *           type: string
 *           description: State name.
 *           example: "Karnataka"
 *         label:
 *           type: string
 *           nullable: true
 *           description: A label for the address (e.g., Home, Work).
 *           example: "Home"
 *         isDefault:
 *           type: boolean
 *           description: Whether this is the default address for the member.
 *
 *     SuccessMessageResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: A success message.
 *           example: "Operation completed successfully."
 *
 * securitySchemes:
 *   bearerAuth: # Should be globally defined in swagger.js; re-declared here for clarity if this file is processed standalone.
 *     type: http
 *     scheme: bearer
 *     bearerFormat: JWT
 * tags:
 *   name: DeliveryAddresses
 *   description: API for managing member delivery addresses
 */

const express = require('express');
const router = express.Router();
const { 
  createDeliveryAddress, 
  getDeliveryAddresses, 
  getDeliveryAddress, 
  updateDeliveryAddress, 
  deleteDeliveryAddress,
  setDefaultAddress
} = require('../controllers/deliveryAddressController');
const { protect } = require('../middleware/auth');
const acl = require('../middleware/acl');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware is in the same location


// All routes are protected and restricted to MEMBER role

/**
 * @swagger
 * /delivery-addresses:
 *   post:
 *     summary: Create a new delivery address for the logged-in member
 *     tags: [DeliveryAddresses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeliveryAddressCreateRequest'
 *     responses:
 *       '201':
 *         description: Delivery address created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddressResponse'
 *       '400':
 *         description: Invalid input data (e.g., missing required fields).
 *       '401':
 *         description: Unauthorized (token missing or invalid).
 *       '404':
 *         description: Member not found for the logged-in user.
 *   get:
 *     summary: Get all delivery addresses for the logged-in member
 *     tags: [DeliveryAddresses]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: A list of delivery addresses, ordered by default status descending.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DeliveryAddressResponse'
 *       '401':
 *         description: Unauthorized.
 *       '404':
 *         description: Member not found for the logged-in user.
 */
router.route('/')
  .post(authMiddleware, createDeliveryAddress)
  .get(authMiddleware, getDeliveryAddresses);

/**
 * @swagger
 * /delivery-addresses/{id}:
 *   get:
 *     summary: Get a specific delivery address by ID
 *     tags: [DeliveryAddresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the delivery address.
 *     responses:
 *       '200':
 *         description: Details of the delivery address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddressResponse'
 *       '400':
 *         description: Invalid address ID format.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden (not authorized to access this address, e.g., address belongs to another member).
 *       '404':
 *         description: Address not found or Member not found.
 *   put:
 *     summary: Update an existing delivery address
 *     tags: [DeliveryAddresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the delivery address to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeliveryAddressUpdateRequest'
 *     responses:
 *       '200':
 *         description: Delivery address updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddressResponse'
 *       '400':
 *         description: Invalid input data or address ID format.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden (not authorized to update this address).
 *       '404':
 *         description: Address not found or Member not found.
 *   delete:
 *     summary: Delete a delivery address
 *     tags: [DeliveryAddresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the delivery address to delete.
 *     responses:
 *       '200':
 *         description: Address deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessageResponse'
 *       '400':
 *         description: Invalid address ID format.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden (not authorized to delete this address).
 *       '404':
 *         description: Address not found or Member not found.
 */
router.route('/:id')
  .get(authMiddleware, getDeliveryAddress)
  .put(authMiddleware, updateDeliveryAddress)
  .delete(authMiddleware, deleteDeliveryAddress);

/**
 * @swagger
 * /delivery-addresses/{id}/set-default:
 *   patch:
 *     summary: Set a specific delivery address as the default for the member
 *     tags: [DeliveryAddresses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the delivery address to set as default.
 *     responses:
 *       '200':
 *         description: Address successfully set as default. Returns the updated address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeliveryAddressResponse'
 *       '400':
 *         description: Invalid address ID format.
 *       '401':
 *         description: Unauthorized.
 *       '403':
 *         description: Forbidden (not authorized to modify this address).
 *       '404':
 *         description: Address not found or Member not found.
 */
router.patch('/:id/set-default', authMiddleware, setDefaultAddress);

module.exports = router;
