const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const categoryUploadDir = path.join(__dirname, '..', 'uploads', 'categories');

// Ensure the upload directory exists
if (!fs.existsSync(categoryUploadDir)) {
  fs.mkdirSync(categoryUploadDir, { recursive: true });
}

// Multer diskStorage setup for category images
const categoryStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, categoryUploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: categoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  },
});

const { getAllSubscriptions } = require('../controllers/adminSubscriptionController');
const {
  createAreaMaster,
  getAllAreaMasters,
  getAreaMasterById,
  updateAreaMaster,
  deleteAreaMaster,
} = require('../controllers/admin/areaMasterController');
const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require('../controllers/admin/categoryController');
const {
  createDepot,
  getAllDepots,
  getDepotById,
  updateDepot,
  deleteDepot,
  getAllDepotsList, // Added for the new list endpoint
} = require('../controllers/admin/depotController');
// const { protect, authorize } = require('../middleware/authMiddleware'); // Assuming you have auth middleware

// Route to get all subscriptions (Admin only)
// router.get('/subscriptions', protect, authorize(['ADMIN']), getAllSubscriptions);
// For now, removing auth middleware for easier testing. Add it back as needed.
router.get('/subscriptions', getAllSubscriptions);

// AreaMaster Routes
router.route('/areamasters')
  .post(createAreaMaster) // Add protect, authorize(['ADMIN']) as needed
  .get(getAllAreaMasters);   // Add protect, authorize(['ADMIN']) as needed

router.route('/areamasters/:id')
  .get(getAreaMasterById)    // Add protect, authorize(['ADMIN']) as needed
  .put(updateAreaMaster)     // Add protect, authorize(['ADMIN']) as needed
  .delete(deleteAreaMaster); // Add protect, authorize(['ADMIN']) as needed

// CategoryMaster Routes
router.route('/categories')
  .post(upload.single('attachment'), createCategory) // Apply multer middleware for single file upload with field name 'attachment'
  .get(getAllCategories);  // Add protect, authorize(['ADMIN']) as needed

router.route('/categories/:id')
  .get(getCategoryById)     // Add protect, authorize(['ADMIN']) as needed
  .put(upload.single('attachment'), updateCategory) // Apply multer for update
  .delete(deleteCategory);  // Add protect, authorize(['ADMIN']) as needed

// DepotMaster Routes
router.get('/depots/all-list', getAllDepotsList); // Route for fetching all depots (id and name)
router.route('/depots')
  .post(createDepot)    // Add protect, authorize(['ADMIN']) as needed
  .get(getAllDepots);  // Add protect, authorize(['ADMIN']) as needed

router.route('/depots/:id')
  .get(getDepotById)     // Add protect, authorize(['ADMIN']) as needed
  .put(updateDepot)      // Add protect, authorize(['ADMIN']) as needed
  .delete(deleteDepot);  // Add protect, authorize(['ADMIN']) as needed

module.exports = router;
