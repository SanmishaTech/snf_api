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
const aclMiddleware = require('../middleware/acl');

// POST /api/agencies - Create a new agency
router.post('/', authMiddleware, createAgency);

// GET /api/agencies - Get all agencies
router.get('/', authMiddleware,  getAllAgencies);

// GET /api/agencies/:id - Get a single agency by ID
router.get('/:id', authMiddleware, getAgencyById);

// PUT /api/agencies/:id - Update an agency
router.put('/:id', authMiddleware, updateAgency);

// DELETE /api/agencies/:id - Delete an agency
router.delete('/:id', authMiddleware, deleteAgency);

module.exports = router;
