const express = require('express');
const router = express.Router();
const {
  createAgency,
  getAllAgencies,
  getAgencyById,
  updateAgency,
  deleteAgency,
} = require('../controllers/agencyController');
const authMiddleware = require('../middleware/auth');
// const aclMiddleware = require('../middleware/acl'); // Assuming aclMiddleware might be used later

/**
 * @swagger
 * tags:
 *   name: Agencies
 *   description: Agency management endpoints
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
 *     AgencyUser:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The ID of the associated user
 *         name:
 *           type: string
 *           description: Full name of the associated user
 *         email:
 *           type: string
 *           format: email
 *           description: Login email of the associated user
 *         role:
 *           type: string
 *           description: Role of the associated user
 *         active:
 *           type: boolean
 *           description: Active status of the associated user
 *     Agency:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated ID of the agency
 *         name:
 *           type: string
 *           description: The name of the agency
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: The contact person for the agency
 *         address1:
 *           type: string
 *           description: Address line 1 of the agency
 *         address2:
 *           type: string
 *           nullable: true
 *           description: Address line 2 of the agency
 *         city:
 *           type: string
 *           nullable: true
 *           description: City of the agency
 *         pincode:
 *           type: integer
 *           description: Pincode of the agency (6 digits)
 *         mobile:
 *           type: string
 *           description: Mobile number of the agency (10 digits)
 *         alternateMobile:
 *           type: string
 *           nullable: true
 *           description: Alternate mobile number of the agency
 *         email:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Contact email of the agency
 *         userId:
 *           type: integer
 *           description: ID of the primary user associated with the agency
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of agency creation
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of last agency update
 *         user:
 *           $ref: '#/components/schemas/AgencyUser'
 *       example:
 *         id: 1
 *         name: "Sunshine Agency"
 *         contactPersonName: "Jane Doe"
 *         address1: "123 Main St"
 *         address2: "Apt 4B"
 *         city: "Anytown"
 *         pincode: 123456
 *         mobile: "9876543210"
 *         alternateMobile: "8765432109"
 *         email: "contact@sunshine.com"
 *         userId: 101
 *         createdAt: "2023-01-15T10:00:00.000Z"
 *         updatedAt: "2023-01-16T11:30:00.000Z"
 *         user:
 *           id: 101
 *           name: "Jane Doe User"
 *           email: "jane.user@example.com"
 *           role: "AGENCY"
 *           active: true
 *     NewAgency: # For POST and PUT request bodies
 *       type: object
 *       required:
 *         - name
 *         - address1
 *         - pincode
 *         - mobile
 *         - userFullName
 *         - userPassword
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *           description: Agency name (min 2 characters)
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: Contact person's name (optional)
 *         address1:
 *           type: string
 *           minLength: 5
 *           description: Address line 1 (min 5 characters)
 *         address2:
 *           type: string
 *           nullable: true
 *           description: Address line 2 (optional)
 *         city:
 *           type: string
 *           nullable: true
 *           description: City (optional)
 *         pincode:
 *           type: string
 *           pattern: "^\\d{6}$"
 *           description: Pincode (must be 6 digits)
 *         mobile:
 *           type: string
 *           pattern: "^\\d{10}$"
 *           description: Mobile number (must be 10 digits)
 *         alternateMobile:
 *           type: string
 *           nullable: true
 *           pattern: "^\\d{10}$"
 *           description: Alternate mobile number (optional, 10 digits if provided)
 *         email:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Agency's contact email (optional)
 *         userFullName:
 *           type: string
 *           minLength: 2
 *           description: Full name of the primary user for the agency (min 2 characters)
 *         userLoginEmail:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Login email for the primary user (optional)
 *         userPassword:
 *           type: string
 *           minLength: 6
 *           description: Password for the primary user's account (min 6 characters)
 *       example:
 *         name: "New Horizons Agency"
 *         contactPersonName: "John Smith"
 *         address1: "456 Oak Avenue"
 *         address2: "Suite 100"
 *         city: "Metropolis"
 *         pincode: "654321"
 *         mobile: "1234567890"
 *         alternateMobile: "0987654321"
 *         email: "info@newhorizons.com"
 *         userFullName: "John Smith (User)"
 *         userLoginEmail: "john.smith@newhorizons.com"
 *         userPassword: "password123"
 */

/**
 * @swagger
 * /agencies:
 *   post:
 *     summary: Create a new agency
 *     tags: [Agencies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewAgency'
 *     responses:
 *       201:
 *         description: Agency created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Agency'
 *       400:
 *         description: Bad request (e.g., missing required fields)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/', authMiddleware, createAgency);

/**
 * @swagger
 * /agencies:
 *   get:
 *     summary: Get all agencies
 *     tags: [Agencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of agencies per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for agency name or email
 *     responses:
 *       200:
 *         description: A list of agencies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: # Changed from 'agencies'
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Agency'
 *                 totalPages:
 *                   type: integer
 *                 totalRecords: # Changed from 'totalItems'
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/', authMiddleware, getAllAgencies);

/**
 * @swagger
 * /agencies/{id}:
 *   get:
 *     summary: Get a single agency by ID
 *     tags: [Agencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The agency ID
 *     responses:
 *       200:
 *         description: Agency data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Agency'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Agency not found
 */
router.get('/:id', authMiddleware, getAgencyById);

/**
 * @swagger
 * /agencies/{id}:
 *   put:
 *     summary: Update an agency by ID
 *     tags: [Agencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The agency ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewAgency' # Can also be a specific UpdateAgency schema
 *     responses:
 *       200:
 *         description: Agency updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Agency'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Agency not found
 */
router.put('/:id', authMiddleware, updateAgency);

/**
 * @swagger
 * /agencies/{id}:
 *   delete:
 *     summary: Delete an agency by ID
 *     tags: [Agencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The agency ID
 *     responses:
 *       200:
 *         description: Agency deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Agency deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Agency not found
 */
router.delete('/:id', authMiddleware, deleteAgency);

module.exports = router;
