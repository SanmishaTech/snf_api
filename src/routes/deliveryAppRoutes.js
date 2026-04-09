const express = require('express');
const router = express.Router();
const deliveryAppController = require('../controllers/deliveryAppController');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // assuming there is an uploads folder
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});
const upload = multer({ storage: storage });

router.get('/my-orders', deliveryAppController.getMyAssignedOrders);
router.put('/assignment/:id', upload.single('deliveryPhoto'), deliveryAppController.updateAssignmentStatus);

module.exports = router;
