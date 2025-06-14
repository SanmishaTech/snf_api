const express = require('express');

/**
 * @swagger
 * components:
 *   schemas:
 *     VendorUser:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated ID of the user.
 *         name:
 *           type: string
 *           description: Full name of the user.
 *         email:
 *           type: string
 *           format: email
 *           description: Login email of the user.
 *         role:
 *           type: string
 *           enum: [VENDOR, AGENCY, ADMIN, MEMBER]
 *           description: Role of the user.
 *         active:
 *           type: boolean
 *           description: Active status of the user.
 *       example:
 *         id: 1
 *         name: "John Doe"
 *         email: "john.doe@example.com"
 *         role: "VENDOR"
 *         active: true
 *
 *     Vendor:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated ID of the vendor.
 *         name:
 *           type: string
 *           description: Name of the vendor.
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: Name of the contact person at the vendor.
 *         address1:
 *           type: string
 *           description: Primary address line of the vendor.
 *         address2:
 *           type: string
 *           nullable: true
 *           description: Secondary address line of the vendor.
 *         city:
 *           type: string
 *           nullable: true
 *           description: City where the vendor is located.
 *         pincode:
 *           type: integer
 *           description: Pincode of the vendor's location.
 *         mobile:
 *           type: string
 *           pattern: '^\d{10}$'
 *           description: Primary mobile number of the vendor (10 digits).
 *         alternateMobile:
 *           type: string
 *           pattern: '^\d{10}$'
 *           nullable: true
 *           description: Alternate mobile number of the vendor (10 digits).
 *         email:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Contact email address of the vendor.
 *         userId:
 *           type: integer
 *           description: ID of the associated user account.
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of when the vendor was created.
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of when the vendor was last updated.
 *         user:
 *           $ref: '#/components/schemas/VendorUser'
 *       example:
 *         id: 1
 *         name: "Global Supplies Ltd."
 *         contactPersonName: "Sarah Connor"
 *         address1: "123 Industrial Way"
 *         address2: "Suite 4B"
 *         city: "Tech City"
 *         pincode: 98765
 *         mobile: "1234567890"
 *         alternateMobile: "0987654321"
 *         email: "contact@globalsupplies.com"
 *         userId: 101
 *         createdAt: "2023-01-15T10:00:00.000Z"
 *         updatedAt: "2023-01-16T12:30:00.000Z"
 *         user:
 *           id: 101
 *           name: "Vendor User One"
 *           email: "vendor.user@example.com"
 *           role: "VENDOR"
 *           active: true
 *
 *     NewVendor:
 *       type: object
 *       required:
 *         - userFullName
 *         - userPassword
 *         - vendorName
 *         - mobile
 *         - address1
 *         - pincode
 *       properties:
 *         userFullName:
 *           type: string
 *           description: Full name of the user to be created for this vendor.
 *           example: "Alice Wonderland"
 *         userLoginEmail:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Login email for the new user. Must be unique if provided.
 *           example: "alice.vendor@example.com"
 *         userPassword:
 *           type: string
 *           format: password
 *           minLength: 6
 *           description: Password for the new user account (min 6 characters).
 *           example: "securePassword123"
 *         vendorName:
 *           type: string
 *           description: Name of the vendor.
 *           example: "Wonderland Goods"
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: Name of the contact person at the vendor.
 *           example: "Mad Hatter"
 *         vendorContactEmail:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Contact email for the vendor. Must be unique if provided.
 *           example: "contact@wonderlandgoods.com"
 *         mobile:
 *           type: string
 *           pattern: '^\d{10}$'
 *           description: Primary mobile number of the vendor (10 digits).
 *           example: "9876543210"
 *         alternateMobile:
 *           type: string
 *           pattern: '^\d{10}$'
 *           nullable: true
 *           description: Alternate mobile number of the vendor (10 digits).
 *           example: "9876543211"
 *         address1:
 *           type: string
 *           description: Primary address line of the vendor.
 *           example: "456 Rabbit Hole Ave"
 *         address2:
 *           type: string
 *           nullable: true
 *           description: Secondary address line of the vendor.
 *           example: "Apt 2B"
 *         city:
 *           type: string
 *           nullable: true
 *           description: City where the vendor is located.
 *           example: "Fantasy Land"
 *         pincode:
 *           type: integer
 *           description: Pincode of the vendor's location.
 *           example: 12345
 *
 *     UpdateVendor:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the vendor.
 *           example: "Global Supplies Ltd. (Updated)"
 *         contactPersonName:
 *           type: string
 *           nullable: true
 *           description: Name of the contact person at the vendor.
 *           example: "Sarah J. Connor"
 *         address1:
 *           type: string
 *           description: Primary address line of the vendor.
 *           example: "123 Industrial Way Revamped"
 *         address2:
 *           type: string
 *           nullable: true
 *           description: Secondary address line of the vendor.
 *           example: "Suite 4B, Annex"
 *         city:
 *           type: string
 *           nullable: true
 *           description: City where the vendor is located.
 *           example: "New Tech City"
 *         pincode:
 *           type: integer
 *           description: Pincode of the vendor's location.
 *           example: 98766
 *         mobile:
 *           type: string
 *           pattern: '^\d{10}$'
 *           description: Primary mobile number of the vendor (10 digits).
 *           example: "1234567891"
 *         alternateMobile:
 *           type: string
 *           pattern: '^\d{10}$'
 *           nullable: true
 *           description: Alternate mobile number of the vendor (10 digits).
 *           example: "0987654322"
 *         email:
 *           type: string
 *           format: email
 *           nullable: true
 *           description: Contact email address of the vendor. Must be unique if changed.
 *           example: "contact.updated@globalsupplies.com"
 *   securitySchemes:
 *     bearerAuth: # Re-declared here for clarity, though ideally defined once in swagger.js
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 * tags:
 *   name: Vendors
 *   description: Vendor management API
 */
const router = express.Router();
const {
  createVendor,
  getAllVendors,
  getVendorById,
  updateVendor,
  deleteVendor,
} = require('../controllers/vendorController');
const authMiddleware = require('../middleware/auth');
const auth = require('../middleware/auth');

// POST /api/vendors - Create a new vendor
/**
 * @swagger
 * /vendors:
 *   post:
 *     summary: Create a new vendor and an associated user account
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NewVendor'
 *     responses:
 *       201:
 *         description: Vendor and user account created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 vendor:
 *                   $ref: '#/components/schemas/Vendor'
 *                 user:
 *                   $ref: '#/components/schemas/VendorUser'
 *       400:
 *         description: Bad request (e.g., validation errors, email already exists).
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.post('/', auth, createVendor);

// GET /api/vendors - Get all vendors
/**
 * @swagger
 * /vendors:
 *   get:
 *     summary: Get all vendors with pagination, sorting, and search
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: name
 *         description: Field to sort by (e.g., name, email, city).
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for vendor name, email, contact person, mobile, city, or associated user name/email.
 *       - in: query
 *         name: active
 *         schema:
 *           type: string
 *           enum: [all, true, false]
 *           default: all
 *         description: Filter by associated user's active status.
 *     responses:
 *       200:
 *         description: A list of vendors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Vendor'
 *                 totalRecords:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', auth, getAllVendors);

// GET /api/vendors/:id - Get a single vendor by ID
/**
 * @swagger
 * /vendors/{id}:
 *   get:
 *     summary: Get a single vendor by ID
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor to retrieve.
 *     responses:
 *       200:
 *         description: Details of the vendor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: Invalid vendor ID format.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Vendor not found.
 *       500:
 *         description: Internal server error.
 */
router.get('/:id', auth, getVendorById);

// PUT /api/vendors/:id - Update a vendor
/**
 * @swagger
 * /vendors/{id}:
 *   put:
 *     summary: Update an existing vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateVendor'
 *     responses:
 *       200:
 *         description: Vendor updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: Bad request (e.g., validation errors, invalid ID format, email already exists).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Vendor not found.
 *       500:
 *         description: Internal server error.
 */
router.put('/:id', auth, updateVendor);

// DELETE /api/vendors/:id - Delete a vendor
/**
 * @swagger
 * /vendors/{id}:
 *   delete:
 *     summary: Delete a vendor (and its associated user)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the vendor to delete.
 *     responses:
 *       200:
 *         description: Vendor deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Vendor with ID 123 deleted successfully."
 *       400:
 *         description: Invalid vendor ID format.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Vendor not found.
 *       409:
 *         description: Conflict - Cannot delete vendor due to existing associations (e.g., orders).
 *       500:
 *         description: Internal server error.
 */
router.delete('/:id', auth, deleteVendor);

module.exports = router;
