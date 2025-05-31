const express = require('express');
const router = express.Router();
const { getAllSubscriptions } = require('../controllers/adminSubscriptionController');
// const { protect, authorize } = require('../middleware/authMiddleware'); // Assuming you have auth middleware

// Route to get all subscriptions (Admin only)
// router.get('/subscriptions', protect, authorize(['ADMIN']), getAllSubscriptions);
// For now, removing auth middleware for easier testing. Add it back as needed.
router.get('/subscriptions', getAllSubscriptions);

module.exports = router;
