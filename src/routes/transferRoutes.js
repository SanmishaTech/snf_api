const express = require('express');
const router = express.Router();

const {
  createTransfer,
  getTransfers,
  updateTransfer,
  getTransfer,
  deleteTransfer,
} = require('../controllers/transferController');

// POST /api/transfers  -> create a new stock transfer
router.post('/', createTransfer);

// GET /api/transfers  -> list transfers (basic)
router.get('/', getTransfers);

// GET /api/transfers/:id -> get single transfer
router.get('/:id', getTransfer);

// PUT /api/transfers/:id -> update transfer
router.put('/:id', updateTransfer);

// DELETE /api/transfers/:id -> delete transfer
router.delete('/:id', deleteTransfer);

module.exports = router;
