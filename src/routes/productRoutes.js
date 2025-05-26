const express = require('express');
const router = express.Router();
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware is in the same location
const aclMiddleware = require('../middleware/acl');   // Assuming acl middleware is in the same location

// POST /api/products - Create a new product
router.post('/', authMiddleware,  createProduct);

// GET /api/products - Get all products
router.get('/', authMiddleware, getAllProducts);

// GET /api/products/:id - Get a single product by ID
router.get('/:id', authMiddleware, getProductById);

// PUT /api/products/:id - Update a product
router.put('/:id', authMiddleware, updateProduct);

// DELETE /api/products/:id - Delete a product
router.delete('/:id', authMiddleware, deleteProduct);

module.exports = router;
