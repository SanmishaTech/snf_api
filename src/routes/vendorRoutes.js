const express = require('express');
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
router.post('/', auth, createVendor);

// GET /api/vendors - Get all vendors
router.get('/', auth, getAllVendors);

// GET /api/vendors/:id - Get a single vendor by ID
router.get('/:id', auth, getVendorById);

// PUT /api/vendors/:id - Update a vendor
router.put('/:id', auth, updateVendor);

// DELETE /api/vendors/:id - Delete a vendor
router.delete('/:id', auth, deleteVendor);

module.exports = router;
