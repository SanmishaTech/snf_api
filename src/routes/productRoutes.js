const express = require('express');

/**
 * @swagger
 * components:
 *   schemas:
 *     ProductBase:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the product.
 *           example: "Organic Apples"
 *         url:
 *           type: string
 *           format: url
 *           nullable: true
 *           description: A URL related to the product (e.g., manufacturer's page).
 *           example: "https://example.com/organic-apples"
 *         price:
 *           type: number
 *           format: float
 *           description: Price of the product. Controller expects string, converts to float.
 *           example: 2.99
 *         rate:
 *           type: number
 *           format: float
 *           description: Rate of the product (e.g., price per unit/kg). Controller expects string, converts to float.
 *           example: 2.99
 *         unit:
 *           type: string
 *           nullable: true
 *           description: Unit of measurement (e.g., kg, piece, pack).
 *           example: "kg"
 *         description:
 *           type: string
 *           nullable: true
 *           description: Detailed description of the product.
 *           example: "Freshly picked organic apples, sweet and crisp."
 *     ProductResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/ProductBase'
 *         - type: object
 *           properties:
 *             id:
 *               type: integer
 *               description: The auto-generated ID of the product.
 *             attachmentUrl:
 *               type: string
 *               format: url
 *               nullable: true
 *               description: URL of the product's attachment/image.
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *     ProductPublicResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         rate:
 *           type: number
 *           format: float
 *         attachmentUrl:
 *           type: string
 *           format: url
 *           nullable: true
 *         url:
 *           type: string
 *           format: url
 *           nullable: true
 *         unit:
 *           type: string
 *           nullable: true
 *     ProductListResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProductResponse'
 *         totalPages:
 *           type: integer
 *         totalRecords:
 *           type: integer
 *         currentPage:
 *           type: integer
 *   securitySchemes:
 *     bearerAuth: # This is already defined in swagger.js, but good for reference if this file were standalone
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 * tags:
 *   name: Products
 *   description: API for managing products
 */
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getPublicProducts, // Import the new controller function
  bulkUpdateVariants,
} = require('../controllers/productController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware is in the same location
const aclMiddleware = require('../middleware/acl');   // Assuming acl middleware is in the same location
const createUploadMiddleware = require('../middleware/uploadMiddleware');

// Configure upload middleware for product attachments
const productUploadMiddleware = createUploadMiddleware('products', [
  {
    name: 'productAttachment', // This is the field name expected in FormData
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 5 * 1024 * 1024, // 5 MB
  },
]);

// GET /api/products/public - Get products for public landing page (NO AUTH)
/**
 * @swagger
 * /products/public:
 *   get:
 *     summary: Get a list of products for public display
 *     tags: [Products]
 *     description: Retrieves a limited list of products (e.g., for a landing page), no authentication required.
 *     responses:
 *       200:
 *         description: A list of products for public display.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ProductPublicResponse'
 *       500:
 *         description: Internal server error.
 */
router.get('/public', getPublicProducts);

// POST /api/products - Create a new product
/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *               - rate
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the product.
 *               url:
 *                 type: string
 *                 format: url
 *                 nullable: true
 *                 description: A URL related to the product.
 *               price:
 *                 type: string # Controller expects string, converts to float
 *                 description: Price of the product.
 *               rate:
 *                 type: string # Controller expects string, converts to float
 *                 description: Rate of the product (e.g., price per unit/kg).
 *               unit:
 *                 type: string
 *                 nullable: true
 *                 description: Unit of measurement.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: Detailed description of the product.
 *               productAttachment:
 *                 type: string
 *                 format: binary
 *                 nullable: true
 *                 description: Optional product image or attachment file.
 *     responses:
 *       201:
 *         description: Product created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       400:
 *         description: Bad request (e.g., validation error, file upload error).
 *       401:
 *         description: Unauthorized.
 *       409:
 *         description: Conflict (e.g., product with this name already exists).
 *       500:
 *         description: Internal server error.
 */
router.post('/', authMiddleware, productUploadMiddleware, createProduct);

// GET /api/products - Get all products
/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get all products (paginated)
 *     tags: [Products]
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
 *           enum: [name, url, price, unit, rate, createdAt, updatedAt]
 *           default: createdAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for product name or URL.
 *     responses:
 *       200:
 *         description: A list of products.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductListResponse'
 *       400:
 *         description: Bad request (e.g., invalid pagination parameters).
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 */
router.get('/', authMiddleware, getAllProducts);

// GET /api/products/:id - Get a single product by ID
/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: Get a single product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the product.
 *     responses:
 *       200:
 *         description: Details of the product.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       400:
 *         description: Invalid ID format.
 *       404:
 *         description: Product not found.
 *       500:
 *         description: Internal server error.
 *     security:
 *       - bearerAuth: [] # Assuming getProductById might require auth based on controller logic, though not explicit in router
 */
router.get('/:id', getProductById); // Note: authMiddleware is not on this route in original code, but controller might imply access control.

// PUT /api/products/:id - Update a product
/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the product to update.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties: # All fields are optional for update
 *               name:
 *                 type: string
 *                 description: Name of the product.
 *               url:
 *                 type: string
 *                 format: url
 *                 nullable: true
 *                 description: A URL related to the product.
 *               price:
 *                 type: string # Controller expects string, converts to float
 *                 description: Price of the product.
 *               rate:
 *                 type: string # Controller expects string, converts to float
 *                 description: Rate of the product (e.g., price per unit/kg).
 *               unit:
 *                 type: string
 *                 nullable: true
 *                 description: Unit of measurement.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: Detailed description of the product.
 *               productAttachment:
 *                 type: string
 *                 format: binary
 *                 nullable: true
 *                 description: Optional new product image or attachment file to replace existing.
 *     responses:
 *       200:
 *         description: Product updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProductResponse'
 *       400:
 *         description: Bad request (e.g., validation error, file upload error, invalid ID).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Product not found.
 *       409:
 *         description: Conflict (e.g., product with this name already exists).
 *       500:
 *         description: Internal server error.
 */
router.put('/:id', authMiddleware, productUploadMiddleware, updateProduct);

// DELETE /api/products/:id - Delete a product
/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the product to delete.
 *     responses:
 *       200:
 *         description: Product deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Product deleted successfully
 *       400:
 *         description: Invalid ID format.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Product not found.
 *       500:
 *         description: Internal server error.
 */
router.delete('/:id', authMiddleware, deleteProduct);

// POST /api/products/:productId/variants/bulk - Bulk update variants for a product
/**
 * @swagger
 * /products/{productId}/variants/bulk:
 *   post:
 *     summary: Bulk create, update, or delete variants for a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the product whose variants are being updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       nullable: true
 *                       description: The ID of the variant if it exists. Omit for new variants.
 *                     hsnCode:
 *                       type: string
 *                     mrp:
 *                       type: number
 *                     sellingPrice:
 *                       type: number
 *                     purchasePrice:
 *                       type: number
 *                     gstRate:
 *                       type: number
 *                     productCategory:
 *                       type: string
 *     responses:
 *       200:
 *         description: Variants updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bulk update completed successfully."
 *       400:
 *         description: Bad request (e.g., invalid product ID, missing variants data).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Product not found.
 *       500:
 *         description: Internal server error.
 */
router.post('/:productId/variants/bulk', authMiddleware, bulkUpdateVariants);

module.exports = router;
