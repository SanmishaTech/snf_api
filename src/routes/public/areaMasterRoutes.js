const express = require('express');
const {
  getPublicAreaMasters,
  validateDairySupport,
  getAreaMastersByPincode,
} = require('../../controllers/public/areaMasterController');

const router = express.Router();

// Public routes - no authentication required
router.get('/', getPublicAreaMasters);
router.get('/validate-dairy/:pincode', validateDairySupport);
router.get('/by-pincode/:pincode', getAreaMastersByPincode);

module.exports = router;