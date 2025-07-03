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
const {
  getPublicProducts,
  getProductById,
} = require("./controllers/productController");
const {
  getPublicLocations,
} = require("./controllers/public/locationController");
const publicDepotVariantRoutes = require("./routes/public/depotVariantsRoutes");

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
  ? allowedOriginsEnv.split(",")
  : ["http://localhost:5173", "https://www.indraai.in/"];

const corsOptions = {
  origin: "*", // Specify the origin of your frontend application
  credentials: true, // This allows cookies and credentials to be included in the requests
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

// Public APIs (no auth)
app.get("/api/products/public", getPublicProducts);
app.get("/api/products/:id", getProductById);
app.get("/api/public/locations", getPublicLocations);
app.use("/api/public/depot-variants", publicDepotVariantRoutes);
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
  roleGuard("ADMIN", "AGENCY", "VENDOR"),
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
app.use(
  "/api/depots",
  authMiddleware,
  allowRoles("ADMIN", "DepotAdmin"),
  depotRoutes
);
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
app.use(swaggerRouter);

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.includes(".")) {
    return next();
  }

  const indexPath = path.join(frontendDistPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      if (err.code === "ENOENT") {
        res
          .status(404)
          .send(
            "Frontend entry point (index.html) not found. Ensure the frontend is built and paths are correctly configured."
          );
      } else {
        res
          .status(500)
          .send(
            "An error occurred while trying to serve the frontend application."
          );
      }
    }
  });
});

app.use((req, res, next) => {
  if (res.headersSent) {
    return next();
  }
  next(createError(404, "The requested resource was not found."));
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(
    "[ERROR HANDLER]:",
    err.status,
    err.message,
    process.env.NODE_ENV === "development" ? err.stack : ""
  );
  res.status(err.status || 500);
  res.json({
    error: {
      message: err.message || "An unexpected error occurred.",
      status: err.status || 500,
      role: err.role || undefined,
    },
  });
});

module.exports = app;
