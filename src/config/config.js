module.exports = {
  appName: process.env.APP_NAME || "SNF",
  defaultUserRole: process.env.DEFAULT_USER_ROLE || "MEMBER",
  allowRegistration: process.env.ALLOW_REGISTRATION || true,
  frontendUrl: process.env.FRONTEND_URL || "https://snf.3.7.237.251.sslip.io/",
};
