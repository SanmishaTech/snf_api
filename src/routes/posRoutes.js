const express = require('express');
const router = express.Router();
const {
  searchMembers,
  quickRegisterMember,
  getDepotProducts,
  createPosOrder,
  getMemberWallet,
} = require('../controllers/posController');
const authMiddleware = require('../middleware/auth');
const { roleGuard } = require('../middleware/authorize');

// All POS routes require authentication and DepotAdmin role
router.use(authMiddleware, roleGuard('ADMIN', 'DepotAdmin'));

// Member search for POS
router.get('/members/search', searchMembers);

// Quick register walk-in customer
router.post('/members', quickRegisterMember);

// Get member wallet balance
router.get('/members/:id/wallet', getMemberWallet);

// Get depot products for POS
router.get('/products', getDepotProducts);

// Create POS order
router.post('/orders', createPosOrder);

module.exports = router;
