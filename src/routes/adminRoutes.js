const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Store category images under the top-level `uploads` folder (sibling of `src`)
const categoryUploadDir = path.join(__dirname, '..', '..', 'uploads', 'categories');

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
const { adminGetUserById, adminUpdateUserById, adminToggleMemberStatus } = require('../controllers/adminUserController'); // Added for admin user management
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
const {
  createBanner,
  getAllBanners,
  getBannerById,
  updateBanner,
  deleteBanner,
} = require('../controllers/admin/bannerController');
const {
  createPurchasePayment,
  getAllPurchasePayments,
  getPurchasePaymentById,
  updatePurchasePayment,
  deletePurchasePayment,
  getVendorPurchases
} = require('../controllers/admin/purchasePaymentController');
const authMiddleware = require('../middleware/auth'); // Corrected path to auth middleware
const createUploadMiddleware = require('../middleware/uploadMiddleware');

// Banner image upload configuration
const bannerImageField = 'bannerImage'; // This will be the field name in the form
const bannerUploadConfig = [
  {
    name: bannerImageField,
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 5 * 1024 * 1024, // 5MB
  },
];
const bannerUploadMiddleware = createUploadMiddleware('banners', bannerUploadConfig); // Corrected path to auth middleware

// Route to get all subscriptions (Admin only)
// router.get('/subscriptions', protect, getAllSubscriptions);
// For now, removing auth middleware for easier testing. Add it back as needed.
router.get('/subscriptions', authMiddleware, getAllSubscriptions);

// AreaMaster Routes
router.route('/areamasters')
  .post(authMiddleware, createAreaMaster)
  .get(authMiddleware, getAllAreaMasters);

router.route('/areamasters/:id')
  .get(authMiddleware, getAreaMasterById)
  .put(authMiddleware, updateAreaMaster)
  .delete(authMiddleware, deleteAreaMaster);

// CategoryMaster Routes
router.route('/categories')
  .post(authMiddleware, upload.single('attachment'), createCategory)
  .get(authMiddleware, getAllCategories);

router.route('/categories/:id')
  .get(authMiddleware, getCategoryById)
  .put(authMiddleware, upload.single('attachment'), updateCategory)
  .delete(authMiddleware, deleteCategory);

// DepotMaster Routes
router.get('/depots/all-list', authMiddleware, getAllDepotsList);
router.route('/depots')
  .post(authMiddleware, createDepot)
  .get(authMiddleware, getAllDepots);

router.route('/depots/:id')
  .get(authMiddleware, getDepotById)
  .put(authMiddleware, updateDepot)
  .delete(authMiddleware, deleteDepot);

// Public Banner Route (NO AUTHENTICATION)
// This should ideally be in a separate publicRoutes.js file
// but adding here for simplicity of this exercise.
router.get('/public/banners', getAllBanners);

// Banner Routes
router.route('/banners')
  .post(authMiddleware, ...bannerUploadMiddleware, createBanner)
  .get(authMiddleware, getAllBanners);

router.route('/banners/:id')
  .get(authMiddleware, getBannerById)
  .put(authMiddleware, ...bannerUploadMiddleware, updateBanner)
  .delete(authMiddleware, deleteBanner);

// Purchase Payment Routes
router.route('/purchase-payments')
  .post(authMiddleware, createPurchasePayment)
  .get(authMiddleware, getAllPurchasePayments);

router.route('/purchase-payments/:id')
  .get(authMiddleware, getPurchasePaymentById)
  .put(authMiddleware, updatePurchasePayment)
  .delete(authMiddleware, deletePurchasePayment);

// Fetch purchases for vendor to aid payment entry form
router.get('/vendors/:vendorId/purchases', authMiddleware, getVendorPurchases);

// Admin User Management Routes
router.route('/users/:userId')
  .get(authMiddleware, adminGetUserById)
  .put(authMiddleware, adminUpdateUserById);

// Admin Member Status Toggle Route
router.patch('/members/:memberId/status', authMiddleware, adminToggleMemberStatus);

module.exports = router;
