const express = require('express');
const router = express.Router();

const {
  createStockLedger,
  getStockLedgers,
  getStockLedgerById,
  updateStockLedger,
  deleteStockLedger,
} = require('../controllers/stockLedgerController');

// TODO: attach auth & ACL middleware as needed
// const authMiddleware = require('../middleware/auth');
// const aclMiddleware = require('../middleware/acl');

router.post('/', /* authMiddleware, */ createStockLedger);
router.get('/', /* authMiddleware, */ getStockLedgers);
router.get('/:id', /* authMiddleware, */ getStockLedgerById);
router.put('/:id', /* authMiddleware, */ updateStockLedger);
router.delete('/:id', /* authMiddleware, */ deleteStockLedger);

module.exports = router;
