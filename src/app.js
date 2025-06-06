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
const swaggerRouter = require("./swagger");
const vendorOrderRoutes = require("./routes/vendorOrderRoutes");
const userRoutes = require("./routes/users");
const deliveryAddressRoutes = require("./routes/deliveryAddressRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const adminRoutes = require("./routes/adminRoutes"); // Added for admin routes
const adminWalletRoutes = require('./routes/admin/wallets');
const adminMembersRouter = require('./routes/admin/members'); // Added for admin members route
const deliveryScheduleRoutes = require("./routes/deliveryScheduleRoutes");
const memberwalletRoutes = require('./routes/wallet')

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
  : ["http://localhost:5173", "http://localhost:3000"];

const corsOptions = {
  origin: "*", // Specify the origin of your frontend application
  credentials: true, // This allows cookies and credentials to be included in the requests
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const frontendDistPath =
  process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_PATH ||
      path.resolve(__dirname, "..", "..", "snf", "dist")
    : path.resolve(__dirname, "..", "..", "snf", "dist");

console.log(`Frontend bui ld path: ${frontendDistPath}`);

console.log(`Serving frontend static files from: ${frontendDistPath}`);
app.use(express.static(frontendDistPath));

const uploadsPath =
  process.env.NODE_ENV === "production"
    ? process.env.UPLOADS_PATH || path.resolve(__dirname, "..", "uploads")
    : path.resolve(__dirname, "..", "uploads");

console.log(`Serving uploads from: ${uploadsPath}`);
app.use("/uploads", express.static(uploadsPath));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/agencies", agencyRoutes);
app.use("/api/products", productRoutes);
app.use("/api/vendor-orders", vendorOrderRoutes);
app.use("/api/delivery-addresses", deliveryAddressRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes); // Added for admin routes
app.use('/api/admin/wallets', adminWalletRoutes);
app.use("/api/admin/members", adminMembersRouter); // Added for admin members route
app.use("/api/delivery-schedules", deliveryScheduleRoutes);
app.use("/api/wallet", memberwalletRoutes)
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
    },
  });
});

module.exports = app;
