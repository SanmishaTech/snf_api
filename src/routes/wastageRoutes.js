const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/wastageController');

// TODO: add auth middleware when available
// const { protect } = require('../middleware/auth');
// router.use(protect);

router.post('/', wastageController.createWastage);
router.get('/', wastageController.listWastages);
router.get('/:id', wastageController.getWastage);
router.put('/:id', wastageController.updateWastage);
router.delete('/:id', wastageController.deleteWastage);

module.exports = router;
