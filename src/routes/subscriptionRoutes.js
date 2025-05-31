const express = require('express');
const router = express.Router();
const {
  createSubscription,
  getSubscriptions,
  getSubscriptionById,
  updateSubscription,
  cancelSubscription,
  renewSubscription,
  getDeliveryScheduleByDate
} = require('../controllers/subscriptionController');
const authMiddleware = require('../middleware/auth');

// All routes are protected
router.route('/')
  .post(authMiddleware, createSubscription)
  .get(authMiddleware, getSubscriptions);

router.route('/:id')
  .get(authMiddleware, getSubscriptionById)
  .put(authMiddleware, updateSubscription);

router.patch('/:id/cancel', authMiddleware, cancelSubscription);
router.post('/:id/renew', authMiddleware, renewSubscription);

// Route to get delivery schedule by date, grouped by agency
router.get('/delivery-schedule/by-date', authMiddleware, getDeliveryScheduleByDate);

module.exports = router;
