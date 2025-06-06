const jwt = require("jsonwebtoken");
const createError = require("http-errors");
const { secret } = require("../config/jwt");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
module.exports = async (req, res, next) => {
  console.log('[AuthMiddleware] Attempting to authenticate for URL:', req.originalUrl);
  const authHeader = req.headers.authorization;
  console.log('[AuthMiddleware] Authorization header:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[AuthMiddleware] No Bearer token found in Authorization header.');
    return next(createError(401, "Unauthorized: No token provided"));
  }
  const token = authHeader.split(" ")[1];
  console.log('[AuthMiddleware] Token extracted:', token ? 'Token present' : 'Token MISSING after split');
  if (!token) {
    return next(createError(401, "Unauthorized"));
  }
  try {
    const decoded = jwt.verify(token, secret);
    console.log('[AuthMiddleware] Token decoded. User ID from token:', decoded?.id);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });
    console.log('[AuthMiddleware] User fetched from DB:', user ? `User ID: ${user.id}, Role: ${user.role}` : 'User NOT FOUND in DB');
    if (!user) {
      console.log('[AuthMiddleware] Authentication failed.');
      return next(createError(401, "Unauthorized: User not found"));
    }

    // If user is an agency, try to find their agencyId
    if (user.role === 'AGENCY') {
      const agency = await prisma.agency.findUnique({
        where: { userId: user.id },
        select: { id: true } // Only select the agency's ID
      });
      if (agency) {
        user.agencyId = agency.id; // Attach agencyId to the user object
        console.log(`[AuthMiddleware] Agency user. Agency ID: ${user.agencyId} attached to req.user.`);
      } else {
        console.warn(`[AuthMiddleware] User role is AGENCY but no corresponding agency record found for userId: ${user.id}`);
        // Depending on policy, you might want to deny access here if an agency user MUST have an agency record
        // For now, we'll let it pass, and the authorize middleware will catch if agencyId is missing.
      }
    }

    req.user = user;
    console.log('[AuthMiddleware] Authentication successful. User set on req.user.');
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error during authentication:', error.message);
    if (error instanceof jwt.JsonWebTokenError) {
      return next(createError(401, "Unauthorized: Invalid token"));
    } else if (error instanceof jwt.TokenExpiredError) {
      return next(createError(401, "Unauthorized: Token expired"));
    }
    return next(createError(401, "Unauthorized: Authentication error"));
  }
};