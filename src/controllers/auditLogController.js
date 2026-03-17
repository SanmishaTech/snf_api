const createError = require("http-errors");
const prisma = require("../config/db");
const { createAuditLog, extractIpAddress } = require("../services/auditLogService");

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildAuditLogWhere(query) {
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const role = typeof query.role === "string" ? query.role.trim() : "";
  const category = typeof query.category === "string" ? query.category.trim() : "";
  const action = typeof query.action === "string" ? query.action.trim() : "";

  const where = {};

  if (role) {
    where.userRole = role;
  }

  if (category) {
    where.category = category;
  }

  if (action) {
    where.action = action;
  }

  if (search) {
    where.OR = [
      { userName: { contains: search } },
      { userRole: { contains: search } },
      { description: { contains: search } },
      { requestPath: { contains: search } },
      { pagePath: { contains: search } },
      { resource: { contains: search } },
      { action: { contains: search } },
    ];
  }

  return where;
}

async function getAuditLogs(req, res, next) {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 100);
    const skip = (page - 1) * limit;
    const where = buildAuditLogWhere(req.query);

    const [logs, totalRecords] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

    res.json({
      logs,
      page,
      totalPages,
      totalRecords,
    });
  } catch (error) {
    console.error("[getAuditLogs]", error);
    next(createError(500, "Failed to fetch activity log"));
  }
}

async function createPageViewAuditLog(req, res, next) {
  try {
    const pagePath = typeof req.body?.path === "string" ? req.body.path.trim() : "";
    const pageTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";

    if (!pagePath) {
      return next(createError(400, "Page path is required"));
    }

    await createAuditLog({
      user: req.user,
      category: "PAGE",
      action: "PAGE_VIEW",
      description: pageTitle ? `Viewed ${pageTitle}` : `Viewed ${pagePath}`,
      resource: "page",
      pagePath,
      method: "GET",
      requestPath: pagePath,
      statusCode: 200,
      ipAddress: extractIpAddress(req),
      userAgent: req.headers["user-agent"] || null,
      metadata: {
        title: pageTitle || null,
        search: typeof req.body?.search === "string" ? req.body.search : null,
      },
    });

    res.status(201).json({ message: "Page view logged" });
  } catch (error) {
    console.error("[createPageViewAuditLog]", error);
    next(createError(500, "Failed to log page activity"));
  }
}

module.exports = {
  createPageViewAuditLog,
  getAuditLogs,
};
