const createError = require("http-errors");

/**
 * Authorization helpers implementing a two-phase pattern:
 * 1. roleGuard(defaultRoles) – attach this when *mounting* a router to enforce a
 *    default set of roles for all its routes.
 * 2. allowRoles(overrideRoles) – place this *inside* a specific route to
 *    override (replace) the default roles chosen by `roleGuard`.
 *
 * The check executes once per request, inside `roleGuard`, **after** any
 * `allowRoles` middleware that may have run earlier in the stack. If
 * `allowRoles` has set `req.allowedRoles`, those take precedence; otherwise
 * the defaults passed to `roleGuard` are used.
 *
 * Example:
 *   const { roleGuard, allowRoles } = require("../middleware/authorize");
 *
 *   // Apply to whole module
 *   app.use("/api/admin", auth, roleGuard("super_admin"), adminRouter);
 *
 *   // Inside adminRouter – override for a route
 *   router.get("/public", allowRoles(), controller);          // anyone logged-in
 *   router.get("/vendors", allowRoles("admin"), controller);  // admin OR super_admin
 */

// Middleware to *override* roles for an individual route.
// Mark route as completely public (no auth, no role check)
function allowPublic() {
  return (req, _res, next) => {
    req.isPublic = true;
    next();
  };
}

function allowRoles(...roles) {
  const normalized = roles.map((r) => String(r).toLowerCase()); // may be []
  return (req, _res, next) => {
    req.allowedRoles = normalized; // store so roleGuard can see
    next();
  };
}

// Main guard – should be placed *after* auth middleware and before router.
function roleGuard(...defaultRoles) {
  const normalizedDefault = defaultRoles.map((r) => String(r).toLowerCase());

  return (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return next(createError(401, "Unauthorized: user not authenticated"));
      }

      // If a preceding allowRoles() set an explicit list, use that, otherwise fall back.
      // Bypass when route declared public
      if (req.isPublic) {
        return next();
      }

      const effectiveRoles = Array.isArray(req.allowedRoles)
        ? req.allowedRoles
        : normalizedDefault;

      // Public (authenticated-only) route when no roles specified.
      if (!effectiveRoles || effectiveRoles.length === 0) {
        return next();
      }

      const userRole = String(user.role || "").toLowerCase();
      if (effectiveRoles.includes(userRole)) {
        return next();
      }

      return next(createError(403, "Forbidden: insufficient privileges"));
    } catch (err) {
      console.error("[roleGuard] error:", err);
      return next(createError(500, "Server error while authorizing"));
    }
  };
}

module.exports = { roleGuard, allowRoles, allowPublic };
