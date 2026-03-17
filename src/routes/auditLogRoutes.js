const express = require("express");
const authMiddleware = require("../middleware/auth");
const { roleGuard } = require("../middleware/authorize");
const {
  createPageViewAuditLog,
  getAuditLogs,
} = require("../controllers/auditLogController");

const router = express.Router();

router.post("/page-view", authMiddleware, createPageViewAuditLog);
router.get("/", authMiddleware, roleGuard("ADMIN"), getAuditLogs);

module.exports = router;
