const express = require('express');
const {
  getPublicDepots,
  getOnlineDepots,
  getPublicDepotById,
} = require('../../controllers/depotController');

const router = express.Router();

// GET /api/public/depots
router.get('/', getPublicDepots);

// GET /api/public/depots/online
router.get('/online', getOnlineDepots);

// GET /api/public/depots/:id
router.get('/:id', getPublicDepotById);

module.exports = router;
