const express = require("express");
const router = express.Router();

const { getDepots, getDepotById } = require("../controllers/depotController");

// Attach auth middleware as needed. Public for simple lookup
// const authMiddleware = require('../middleware/auth');

// GET /api/depots
router.get("/", getDepots);

// GET /api/depots/:id
router.get("/:id", getDepotById);

module.exports = router;
