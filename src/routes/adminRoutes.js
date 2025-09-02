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
  getAdminDeliveryAddresses,
  getAdminDeliveryAddress,
  updateAdminDeliveryAddress,
  deleteAdminDeliveryAddress,
  createAdminDeliveryAddress,
  setAdminDefaultAddress
} = require('../controllers/admin/adminDeliveryAddressController');
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
  createDepotProductVariant,
  getDepotProductVariants,
  getDepotProductVariantById,
  updateDepotProductVariant,
  deleteDepotProductVariant,
} = require('../controllers/admin/depotProductVariantController');

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
const {
  createCity,
  getAllCities,
  getCityById,
  updateCity,
  deleteCity,
} = require('../controllers/admin/cityController');
const {
  createLocation,
  getAllLocations,
  getLocationById,
  updateLocation,
  deleteLocation,
} = require('../controllers/admin/locationController');
const {
  getAllSNFOrders,
  getSNFOrderById,
  markSNFOrderAsPaid,
  updateSNFOrder,
  generateSNFOrderInvoice,
  downloadSNFOrderInvoice,
} = require('../controllers/admin/snfOrderAdminController');

// Import admin delivery routes
const adminDeliveryRoutes = require('./adminDeliveryRoutes');
const { 
  getDeliveryDateOrdersReport, 
  getReportFilters 
} = require('../controllers/admin/deliveryReportController');
const {
  getDeliveryLabelingReport
} = require('../controllers/admin/deliveryLabelingController');
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

// Public Categories Route (NO AUTHENTICATION)
// Returns minimal public fields for categories
router.get('/categories/public/AllCategories', async (req, res, next) => {
  try {
    const prisma = require('../config/db');
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        imageUrl: true,
        isDairy: true,
      },
      orderBy: { name: 'asc' },
    });

    // Standardized public response wrapper
    res.status(200).json({
      success: true,
      data: categories,
      message: 'Categories fetched successfully',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Public categories fetch failed:', err);
    res.status(500).json({
      success: false,
      data: [],
      message: 'Failed to fetch categories',
      error: err?.message || 'Internal Server Error',
      timestamp: new Date(),
    });
  }
});

// Depot Product Variant Routes
router.route('/depot-product-variants')
  .post(authMiddleware, createDepotProductVariant)
  .get(authMiddleware, getDepotProductVariants);

router.route('/depot-product-variants/:id')
  .get(authMiddleware, getDepotProductVariantById)
  .put(authMiddleware, updateDepotProductVariant)
  .delete(authMiddleware, deleteDepotProductVariant);

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

// City Routes
router.route('/cities')
  .post(authMiddleware, createCity)
  .get(authMiddleware, getAllCities);

router.route('/cities/:id')
  .get(authMiddleware, getCityById)
  .put(authMiddleware, updateCity)
  .delete(authMiddleware, deleteCity);

// Location Routes
router.route('/locations')
  .post(authMiddleware, createLocation)
  .get(authMiddleware, getAllLocations);

router.route('/locations/:id')
  .get(authMiddleware, getLocationById)
  .put(authMiddleware, updateLocation)
  .delete(authMiddleware, deleteLocation);

// SNF Orders (Admin)
router.route('/snf-orders')
  .get(authMiddleware, getAllSNFOrders);

router.route('/snf-orders/:id')
  .get(authMiddleware, getSNFOrderById)
  .patch(authMiddleware, updateSNFOrder);

// Explicit mark-paid endpoint (preferred if available)
router.patch('/snf-orders/:id/mark-paid', authMiddleware, markSNFOrderAsPaid);

// Invoice generation and download for SNF orders
router.post('/snf-orders/:id/generate-invoice', authMiddleware, generateSNFOrderInvoice);
router.get('/snf-orders/:id/download-invoice', authMiddleware, downloadSNFOrderInvoice);

// Admin Delivery Address Routes
router.route('/delivery-addresses')
  .get(authMiddleware, getAdminDeliveryAddresses)
  .post(authMiddleware, createAdminDeliveryAddress);

router.route('/delivery-addresses/:id')
  .get(authMiddleware, getAdminDeliveryAddress)
  .put(authMiddleware, updateAdminDeliveryAddress)
  .delete(authMiddleware, deleteAdminDeliveryAddress);

router.patch('/delivery-addresses/:id/set-default', authMiddleware, setAdminDefaultAddress);

// Admin Delivery Management Routes
router.use('/deliveries', adminDeliveryRoutes);

// Delivery Date Orders Report Routes
router.get('/reports/delivery-date-orders', authMiddleware, getDeliveryDateOrdersReport);
router.get('/reports/delivery-labeling', authMiddleware, getDeliveryLabelingReport);
router.get('/reports/filters', authMiddleware, getReportFilters);

module.exports = router;
