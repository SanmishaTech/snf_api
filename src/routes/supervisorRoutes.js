const express = require('express');
const router = express.Router();
const {
  createSupervisor,
  getAllSupervisors,
  getSupervisorById,
  updateSupervisor,
  deleteSupervisor,
} = require('../controllers/supervisorController');
const authMiddleware = require('../middleware/auth');
// const aclMiddleware = require('../middleware/acl'); // Assuming aclMiddleware might be used later

/**
 * @swagger
 * tags:
 *   name: Supervisors
 *   description: Supervisor management endpoints
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
 *     SupervisorUser:
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
 *     SupervisorDepot:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The ID of the associated depot
 *         name:
 *           type: string
 *           description: Name of the associated depot
 *     Supervisor:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated ID of the supervisor
 *         name:
 *           type: string
 *           description: The name of the supervisor
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: The contact person for the supervisor
 *         address1:
 *           type: string
 *           description: Address line 1 of the supervisor
 *         address2:
 *           type: string
 *           nullable: true
 *           description: Address line 2 of the supervisor
 *         city:
 *           type: string
 *           nullable: true
 *           description: City of the supervisor
 *         pincode:
 *           type: integer
 *           description: Pincode of the supervisor (6 digits)
 *         mobile:
 *           type: string
 *           description: Mobile number of the supervisor (10 digits)
 *         alternateMobile:
 *           type: string
 *           nullable: true
 *           description: Alternate mobile number of the supervisor
 *         email:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Contact email of the supervisor
 *         userId:
 *           type: integer
 *           description: ID of the primary user associated with the supervisor
 *         depotId:
 *           type: integer
 *           nullable: true
 *           description: ID of the depot associated with the supervisor
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of supervisor creation
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of last supervisor update
 *         user:
 *           $ref: '#/components/schemas/SupervisorUser'
 *         depot:
 *           $ref: '#/components/schemas/SupervisorDepot'
 *       example:
 *         id: 1
 *         name: "Regional Supervisor"
 *         contactPersonName: "John Smith"
 *         address1: "123 Main St"
 *         address2: "Floor 2"
 *         city: "Anytown"
 *         pincode: 123456
 *         mobile: "9876543210"
 *         alternateMobile: "8765432109"
 *         email: "supervisor@example.com"
 *         userId: 101
 *         depotId: 1
 *         createdAt: "2023-01-15T10:00:00.000Z"
 *         updatedAt: "2023-01-16T11:30:00.000Z"
 *         user:
 *           id: 101
 *           name: "John Smith User"
 *           email: "john.user@example.com"
 *           role: "SUPERVISOR"
 *           active: true
 *         depot:
 *           id: 1
 *           name: "Main Depot"
 *     NewSupervisor: # For POST and PUT request bodies
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
 *           description: Supervisor name (min 2 characters)
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
 *           description: Supervisor's contact email (optional)
 *         depotId:
 *           type: integer
 *           nullable: true
 *           description: ID of the depot to associate with the supervisor (optional)
 *         userFullName:
 *           type: string
 *           minLength: 2
 *           description: Full name of the primary user for the supervisor (min 2 characters)
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
 *         name: "Regional Operations Supervisor"
 *         contactPersonName: "Jane Doe"
 *         address1: "456 Oak Avenue"
 *         address2: "Suite 200"
 *         city: "Metropolis"
 *         pincode: "654321"
 *         mobile: "1234567890"
 *         alternateMobile: "0987654321"
 *         email: "jane.supervisor@example.com"
 *         depotId: 1
 *         userFullName: "Jane Doe (User)"
 *         userLoginEmail: "jane.doe@example.com"
 *         userPassword: "password123"
 */

/**
 * @swagger
 * /supervisors:
 *   post:
 *     summary: Create a new supervisor
 *     tags: [Supervisors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewSupervisor'
 *     responses:
 *       201:
 *         description: Supervisor created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Supervisor'
 *       400:
 *         description: Bad request (e.g., missing required fields)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/', authMiddleware, createSupervisor);

/**
 * @swagger
 * /supervisors:
 *   get:
 *     summary: Get all supervisors
 *     tags: [Supervisors]
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
 *         description: Number of supervisors per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for supervisor name or email
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [all, true, false]
 *           default: all
 *         description: Filter by active status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, email, city, createdAt, updatedAt]
 *           default: name
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: A list of supervisors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Supervisor'
 *                 totalPages:
 *                   type: integer
 *                 totalRecords:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/', authMiddleware, getAllSupervisors);

/**
 * @swagger
 * /supervisors/{id}:
 *   get:
 *     summary: Get a single supervisor by ID
 *     tags: [Supervisors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The supervisor ID
 *     responses:
 *       200:
 *         description: Supervisor data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Supervisor'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Supervisor not found
 */
router.get('/:id', authMiddleware, getSupervisorById);

/**
 * @swagger
 * /supervisors/{id}:
 *   put:
 *     summary: Update a supervisor by ID
 *     tags: [Supervisors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The supervisor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               contactPersonName:
 *                 type: string
 *                 nullable: true
 *               address1:
 *                 type: string
 *                 minLength: 5
 *               address2:
 *                 type: string
 *                 nullable: true
 *               city:
 *                 type: string
 *                 nullable: true
 *               pincode:
 *                 type: string
 *                 pattern: "^\\d{6}$"
 *               mobile:
 *                 type: string
 *                 pattern: "^\\d{10}$"
 *               alternateMobile:
 *                 type: string
 *                 nullable: true
 *               email:
 *                 type: string
 *                 format: email
 *                 nullable: true
 *               depotId:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Supervisor updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Supervisor'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Supervisor not found
 */
router.put('/:id', authMiddleware, updateSupervisor);

/**
 * @swagger
 * /supervisors/{id}:
 *   delete:
 *     summary: Delete a supervisor by ID
 *     tags: [Supervisors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: The supervisor ID
 *     responses:
 *       200:
 *         description: Supervisor deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Supervisor deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Supervisor not found
 *       409:
 *         description: Conflict - Supervisor has associated records
 */
router.delete('/:id', authMiddleware, deleteSupervisor);

module.exports = router;