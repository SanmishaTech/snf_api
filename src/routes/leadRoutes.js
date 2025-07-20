const express = require('express');
const {
  createLead,
  getAllLeads,
  getLeadById,
  updateLeadStatus,
  deleteLead,
} = require('../controllers/leadController');

const authMiddleware = require('../middleware/auth');
const { roleGuard } = require('../middleware/authorize');

const router = express.Router();

// Public route - lead creation (no auth required)
router.post('/', createLead);

// Protected routes - Admin only
router.use(authMiddleware);
router.use(roleGuard('ADMIN'));

router.get('/', getAllLeads);
router.get('/:id', getLeadById);
router.put('/:id/status', updateLeadStatus);
router.delete('/:id', deleteLead);

module.exports = router;