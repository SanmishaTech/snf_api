const express = require('express');
const router = express.Router();
const { 
  createDeliveryAddress, 
  getDeliveryAddresses, 
  getDeliveryAddress, 
  updateDeliveryAddress, 
  deleteDeliveryAddress,
  setDefaultAddress
} = require('../controllers/deliveryAddressController');
const { protect } = require('../middleware/auth');
const acl = require('../middleware/acl');
const authMiddleware = require('../middleware/auth'); // Assuming auth middleware is in the same location


// All routes are protected and restricted to MEMBER role

router.route('/')
  .post(authMiddleware, createDeliveryAddress)
  .get(authMiddleware, getDeliveryAddresses);

router.route('/:id')
  .get(authMiddleware, getDeliveryAddress)
  .put(authMiddleware, updateDeliveryAddress)
  .delete(authMiddleware, deleteDeliveryAddress);

router.patch('/:id/set-default', authMiddleware, setDefaultAddress);

module.exports = router;
