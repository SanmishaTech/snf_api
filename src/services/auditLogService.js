const prisma = require("../config/db");

const SENSITIVE_FIELDS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "token",
  "resetToken",
  "authorization",
  "cookie",
  "refreshToken",
]);

function normalizeRequestPath(pathname = "") {
  return String(pathname || "").split("?")[0] || "/";
}

function humanizeSegment(value = "") {
  return String(value)
    .replace(/[-_]/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeAuditValue(value, depth = 0) {
  if (value == null) {
    return value;
  }

  if (depth > 2) {
    return "[truncated]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeAuditValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, 20);
    return entries.reduce((accumulator, [key, nestedValue]) => {
      if (SENSITIVE_FIELDS.has(key)) {
        accumulator[key] = "[redacted]";
        return accumulator;
      }

      accumulator[key] = sanitizeAuditValue(nestedValue, depth + 1);
      return accumulator;
    }, {});
  }

  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 197)}...` : value;
  }

  return value;
}

function extractIpAddress(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return String(forwardedFor[0]).trim();
  }

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
}

function getResourceDetails(pathname) {
  const segments = normalizeRequestPath(pathname)
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "api" && segment !== "admin");

  const resource = segments[0] || null;
  const resourceId = segments.find((segment, index) => index > 0 && /^[\w-]+$/.test(segment)) || null;

  return {
    resource,
    resourceId,
  };
}

function inferApiAction(method, pathname) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedPath = normalizeRequestPath(pathname);

  if (normalizedPath === "/api/auth/change-password") {
    return "CHANGE_PASSWORD";
  }

  if (normalizedPath.endsWith("/status")) {
    return "STATUS_CHANGE";
  }

  if (normalizedPath.endsWith("/mark-paid")) {
    return "MARK_PAID";
  }

  if (normalizedPath.endsWith("/generate-invoice")) {
    return "GENERATE_INVOICE";
  }

  if (normalizedPath.endsWith("/set-default")) {
    return "SET_DEFAULT";
  }

  switch (normalizedMethod) {
    case "POST":
      return "CREATE";
    case "PUT":
    case "PATCH":
      return "UPDATE";
    case "DELETE":
      return "DELETE";
    default:
      return "ACTION";
  }
}

function buildApiDescription({ action, resource, resourceId, statusCode }) {
  const resourceLabel = humanizeSegment(resource || "request").toLowerCase();
  const targetLabel = resourceId ? `${resourceLabel} #${resourceId}` : resourceLabel;
  const failed = Number(statusCode) >= 400;

  switch (action) {
    case "CREATE":
      return failed ? `Failed to create ${resourceLabel}` : `Created ${targetLabel}`;
    case "UPDATE":
      return failed ? `Failed to update ${targetLabel}` : `Updated ${targetLabel}`;
    case "DELETE":
      return failed ? `Failed to delete ${targetLabel}` : `Deleted ${targetLabel}`;
    case "CHANGE_PASSWORD":
      return failed ? "Failed to change password" : "Changed password";
    case "STATUS_CHANGE":
      return failed ? `Failed to change ${resourceLabel} status` : `Changed ${resourceLabel} status`;
    case "MARK_PAID":
      return failed ? `Failed to mark ${targetLabel} as paid` : `Marked ${targetLabel} as paid`;
    case "GENERATE_INVOICE":
      return failed ? `Failed to generate invoice for ${targetLabel}` : `Generated invoice for ${targetLabel}`;
    case "SET_DEFAULT":
      return failed ? `Failed to set default ${resourceLabel}` : `Set default ${resourceLabel}`;
    default:
      return `${humanizeSegment(action)} ${targetLabel}`;
  }
}

async function createAuditLog({
  user,
  userId,
  userName,
  userRole,
  category,
  action,
  description,
  resource,
  resourceId,
  pagePath,
  method,
  requestPath,
  statusCode,
  ipAddress,
  userAgent,
  metadata,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: user?.id || userId || null,
        userName: user?.name || userName || null,
        userRole: user?.role || userRole || null,
        category,
        action,
        description: description || null,
        resource: resource || null,
        resourceId: resourceId ? String(resourceId) : null,
        pagePath: pagePath || null,
        method: method || null,
        requestPath: requestPath || null,
        statusCode: typeof statusCode === "number" ? statusCode : null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
        metadata: metadata ? sanitizeAuditValue(metadata) : null,
      },
    });
  } catch (error) {
    console.error("[auditLogService] Failed to create audit log:", error.message);
  }
}

function shouldSkipAutoApiLog(req) {
  const normalizedPath = normalizeRequestPath(req.originalUrl);
  const normalizedMethod = String(req.method || "").toUpperCase();

  if (!req.user) {
    return true;
  }

  if (req.auditLogDisabled) {
    return true;
  }

  if (["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    return true;
  }

  if (normalizedPath.startsWith("/api/audit-logs")) {
    return true;
  }

  if (normalizedPath === "/api/auth/login") {
    return true;
  }

  return false;
}

async function logApiActivity(req, res) {
  if (shouldSkipAutoApiLog(req)) {
    return;
  }

  const requestPath = normalizeRequestPath(req.originalUrl);
  const { resource, resourceId } = getResourceDetails(requestPath);
  const action = inferApiAction(req.method, requestPath);

  await createAuditLog({
    user: req.user,
    category: "API",
    action,
    description: buildApiDescription({
      action,
      resource,
      resourceId,
      statusCode: res.statusCode,
    }),
    resource,
    resourceId,
    method: req.method,
    requestPath,
    statusCode: res.statusCode,
    ipAddress: extractIpAddress(req),
    userAgent: req.headers["user-agent"] || null,
    metadata: {
      query: req.query,
      body: req.body,
    },
  });
}

async function logLoginAttempt({ user, identifier, success, req, reason }) {
  await createAuditLog({
    user,
    userName: user?.name || identifier || "Unknown user",
    userRole: user?.role || null,
    category: "AUTH",
    action: success ? "LOGIN_SUCCESS" : "LOGIN_FAILED",
    description: success
      ? `Logged in successfully${user?.name ? ` as ${user.name}` : ""}`
      : `Failed login attempt${identifier ? ` for ${identifier}` : ""}`,
    resource: "auth",
    method: "POST",
    requestPath: "/api/auth/login",
    statusCode: success ? 200 : 401,
    ipAddress: extractIpAddress(req),
    userAgent: req.headers["user-agent"] || null,
    metadata: {
      identifier,
      reason: reason || null,
    },
  });
}

module.exports = {
  createAuditLog,
  extractIpAddress,
  logApiActivity,
  logLoginAttempt,
  sanitizeAuditValue,
};
