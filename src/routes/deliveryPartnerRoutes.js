const express = require('express');
const router = express.Router();
const deliveryPartnerController = require('../controllers/deliveryPartnerController');
const { authorize } = require('../middleware/auth'); // assuming they have this
const createUploadMiddleware = require("../middleware/uploadMiddleware");

// Configure upload middleware for delivery partner profile photos
const deliveryPartnerUploadMiddleware = createUploadMiddleware("deliveryPartners", [
  {
    name: "profilePhoto",
    allowedTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
]);

router.get('/', deliveryPartnerController.getDeliveryPartners);
router.post('/', deliveryPartnerUploadMiddleware, deliveryPartnerController.createDeliveryPartner);
router.get('/:id', deliveryPartnerController.getDeliveryPartnerById);
router.put('/:id', deliveryPartnerUploadMiddleware, deliveryPartnerController.updateDeliveryPartner);
router.put('/:id/status', deliveryPartnerController.updateDeliveryPartnerStatus);

module.exports = router;
