const express = require('express');
const router = express.Router();
const deliveryAssignmentController = require('../controllers/deliveryAssignmentController');

router.get('/pending', deliveryAssignmentController.getPendingOrders);
router.post('/assign', deliveryAssignmentController.assignOrders);
router.get('/track', deliveryAssignmentController.getTrackAssignments);
router.delete('/:id', deliveryAssignmentController.unassignOrder);
router.post('/:id/retry', deliveryAssignmentController.retryOrder);

module.exports = router;
