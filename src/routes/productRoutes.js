const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getPublicProducts, // Import the new controller function
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
router.get('/public', getPublicProducts);

// POST /api/products - Create a new product
router.post('/', authMiddleware, productUploadMiddleware, createProduct);

// GET /api/products - Get all products
router.get('/', authMiddleware, getAllProducts);

// GET /api/products/:id - Get a single product by ID
router.get('/:id', authMiddleware, getProductById);

// PUT /api/products/:id - Update a product
router.put('/:id', authMiddleware, productUploadMiddleware, updateProduct);

// DELETE /api/products/:id - Delete a product
router.delete('/:id', authMiddleware, deleteProduct);

module.exports = router;
