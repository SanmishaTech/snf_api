const { logApiActivity } = require("../services/auditLogService");

module.exports = (req, res, next) => {
  res.on("finish", () => {
    void logApiActivity(req, res);
  });

  next();
};
