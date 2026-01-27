//Vipul
const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const cors = require("cors");
const createError = require("http-errors");
const path = require("path");
require("dotenv").config();

const authRoutes = require("./routes/auth");

const vendorRoutes = require("./routes/vendorRoutes");
const agencyRoutes = require("./routes/agencyRoutes");
const supervisorRoutes = require("./routes/supervisorRoutes");
const productRoutes = require("./routes/productRoutes");
const productVariantRoutes = require("./routes/productVariantRoutes");
const depotProductVariantRoutes = require("./routes/depotProductVariantRoutes");
const swaggerRouter = require("./swagger");
const vendorOrderRoutes = require("./routes/vendorOrderRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const wastageRoutes = require("./routes/wastageRoutes");
const userRoutes = require("./routes/users");
const deliveryAddressRoutes = require("./routes/deliveryAddressRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const adminRoutes = require("./routes/adminRoutes"); // Added for admin routes
const adminWalletRoutes = require("./routes/admin/wallets");
const adminMembersRouter = require("./routes/admin/members"); // Added for admin members route
const deliveryScheduleRoutes = require("./routes/deliveryScheduleRoutes");
const memberwalletRoutes = require("./routes/wallet");
const teamRoutes = require("./routes/teamRoutes");
const variantStockRoutes = require("./routes/variantStockRoutes");
const depotRoutes = require("./routes/depotRoutes");
const stockLedgerRoutes = require("./routes/stockLedgerRoutes");
const transferRoutes = require("./routes/transferRoutes");
const productOrderRoutes = require("./routes/productOrderRoutes");
const invoiceRoutes = require("./routes/invoices");
const {
  getPublicProducts,
  getProductById,
} = require("./controllers/productController");
const {
  getPublicLocations,
} = require("./controllers/public/locationController");
const publicDepotVariantRoutes = require("./routes/public/depotVariantsRoutes");
const publicAreaMasterRoutes = require("./routes/public/areaMasterRoutes");
const leadRoutes = require("./routes/leadRoutes");
const snfOrderRoutes = require("./routes/snfOrderRoutes");
const reportRoutes = require("./routes/reportRoutes");

// --- Authorization helpers ---
const authMiddleware = require("./middleware/auth");
const { roleGuard, allowRoles } = require("./middleware/authorize"); // default role guard

const app = express();

app.use(morgan("dev"));

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource sharing
  })
);

const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
const allowedOrigins = allowedOriginsEnv
  ? allowedOriginsEnv
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : ["http://localhost:5173", "https://www.indraai.in"];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes("*")) {
      return callback(null, true);
    }

    return callback(null, allowedOrigins.includes(origin));
  },
  credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

const frontendDistPath =
  process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_PATH ||
      path.resolve(__dirname, "..", "..", "snf", "dist")
    : path.resolve(__dirname, "..", "..", "snf", "dist");

console.log(`snf bui ld path: ${frontendDistPath}`);

console.log(`Serving frontend static files from: ${frontendDistPath}`);
app.use(express.static(frontendDistPath));

const uploadsPath =
  process.env.NODE_ENV === "production"
    ? process.env.UPLOADS_PATH || path.resolve(__dirname, "..", "uploads") // Corrected path
    : path.resolve(__dirname, "..", "uploads"); // Corrected path

console.log(`Serving uploads from: ${uploadsPath}`);
app.use("/uploads", express.static(uploadsPath));

// Middleware to auto-generate missing invoices for static requests
app.use("/uploads/invoices/:invoiceNo", async (req, res, next) => {
  const invoiceNo = req.params.invoiceNo.replace('.pdf', '');
  const invoicePath = path.resolve(__dirname, "..", "uploads", "invoices", `${invoiceNo}.pdf`);
  
  // Check if file exists
  const fs = require('fs').promises;
  try {
    await fs.access(invoicePath);
    // File exists, continue to static serving
    next();
  } catch (error) {
    // File doesn't exist, try to generate it
    try {
      const { PrismaClient } = require('@prisma/client');
      const { generateInvoiceForOrder } = require('./services/invoiceService');
      const prisma = new PrismaClient();
      
      // Find the order by invoice number (financial year format: YYNN-NNNNN)
      const productOrder = await prisma.productOrder.findFirst({
        where: { invoiceNo },
        include: {
          subscriptions: {
            include: {
              product: true,
              depotProductVariant: true,
              deliveryScheduleEntries: {
                orderBy: { deliveryDate: 'asc' }
              }
            }
          },
          member: { include: { user: true } }
        }
      });
      
      if (productOrder) {
        console.log(`Generating invoice ${invoiceNo} for order ${productOrder.orderNo}`);
        // Generate the invoice
        await generateInvoiceForOrder(productOrder);
        
        await prisma.$disconnect();
        
        // Now serve the newly generated file
        res.sendFile(invoicePath);
      } else {
        await prisma.$disconnect();
        res.status(404).json({ error: 'Invoice not found - order does not exist or invoice was never generated' });
      }
    } catch (genError) {
      console.error('Error generating invoice:', genError);
      res.status(500).json({ error: 'Failed to generate invoice', details: genError.message });
    }
  }
});

// Public APIs (no auth)
app.get("/api/products/public", getPublicProducts);
app.get("/api/products/:id", getProductById);
app.get("/api/public/locations", getPublicLocations);
app.use("/api/public/depot-variants", publicDepotVariantRoutes);
app.use("/api/public/area-masters", publicAreaMasterRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/snf-orders", snfOrderRoutes);
app.use("/api/product-orders", productOrderRoutes);
app.use("/api/wastage", wastageRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use(
  "/api/vendors",
  authMiddleware,
  roleGuard("ADMIN", "VENDOR", "DepotAdmin"),
  vendorRoutes
);
app.use(
  "/api/agencies",
  authMiddleware,
  roleGuard("ADMIN", "AGENCY"),
  agencyRoutes
);
app.use(
  "/api/supervisors",
  authMiddleware,
  roleGuard("ADMIN", "SUPERVISOR"),
  supervisorRoutes
);
// Product routes include a mix of public and protected endpoints.
// Individual routes inside productRoutes declare their own auth / role requirements.
app.use("/api/products", productRoutes);
app.use(
  "/api/product-variants",
  authMiddleware,
  roleGuard("ADMIN", "DepotAdmin", "AGENCY", "VENDOR"),
  productVariantRoutes
);
app.use(
  "/api/depot-product-variants",
  authMiddleware,
  depotProductVariantRoutes
);
app.use(
  "/api/vendor-orders",
  authMiddleware,
  roleGuard("ADMIN", "AGENCY", "VENDOR", "SUPERVISOR"),
  vendorOrderRoutes
);
app.use(
  "/api/purchases",
  authMiddleware,
  roleGuard("ADMIN", "DepotAdmin"),
  purchaseRoutes
);
app.use(
  "/api/wastages",
  authMiddleware,
  roleGuard("ADMIN", "DepotAdmin"),
  wastageRoutes
);
app.use(
  "/api/delivery-addresses",
  authMiddleware,
  roleGuard("ADMIN", "MEMBER"),
  deliveryAddressRoutes
);
app.use(
  "/api/subscriptions",
  authMiddleware,
  roleGuard("ADMIN", "MEMBER"),
  subscriptionRoutes
);
app.use("/api/invoices", authMiddleware, invoiceRoutes);
// Mount admin routes WITHOUT global auth so that any public endpoints defined inside (like /categories/public) remain public.
// Individual admin endpoints already apply authMiddleware at the route level where needed.
app.use("/api/admin", adminRoutes); // Added for admin routes

app.use(
  "/api/admin/wallets",
  authMiddleware,
  roleGuard("ADMIN"),
  adminWalletRoutes
);
app.use(
  "/api/admin/members",
  authMiddleware,
  roleGuard("ADMIN"),
  adminMembersRouter
); // protected admin members
app.use(
  "/api/delivery-schedules",
  authMiddleware,
  allowRoles("ADMIN", "AGENCY"),
  deliveryScheduleRoutes
);
app.use(
  "/api/wallet",
  authMiddleware,
  allowRoles("ADMIN", "DepotAdmin", "MEMBER"),
  memberwalletRoutes
);
app.use("/api/teams", authMiddleware, allowRoles("ADMIN"), teamRoutes);
app.use(
  "/api/variant-stocks",
  authMiddleware,
  allowRoles("ADMIN", "DepotAdmin"),
  variantStockRoutes
);
app.use("/api/depots", depotRoutes);
app.use(
  "/api/transfers",
  authMiddleware,
  roleGuard("ADMIN", "DepotAdmin"),
  transferRoutes
);
app.use(
  "/api/stock-ledgers",
  authMiddleware,
  allowRoles("ADMIN", "DepotAdmin"),
  stockLedgerRoutes
);
app.use("/api/reports", authMiddleware, roleGuard("ADMIN", "AGENCY", "VENDOR"), reportRoutes);

module.exports = app;
