const jwt = require("jsonwebtoken");
const { secret } = require("../config/jwt");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Optional authentication middleware
 * Sets req.user if a valid token is provided, but doesn't require authentication
 * This allows endpoints to be accessed both by authenticated and non-authenticated users
 */
module.exports = async (req, res, next) => {
  console.log('[OptionalAuthMiddleware] Processing request for URL:', req.originalUrl);
  
  const authHeader = req.headers.authorization;
  
  // If no auth header, continue without setting req.user
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[OptionalAuthMiddleware] No Bearer token found. Proceeding without authentication.');
    return next();
  }

  const token = authHeader.split(" ")[1];
  
  // If no token after split, continue without setting req.user
  if (!token) {
    console.log('[OptionalAuthMiddleware] No token found after Bearer split. Proceeding without authentication.');
    return next();
  }

  try {
    const decoded = jwt.verify(token, secret);
    console.log('[OptionalAuthMiddleware] Token decoded. User ID from token:', decoded?.id);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        member: {
          select: { id: true }
        },
        agency: {
          select: { id: true }
        }
      }
    });
    
    if (user) {
      console.log('[OptionalAuthMiddleware] User found:', `ID: ${user.id}, Role: ${user.role}`);
      
      // If user is an agency, attach agencyId
      if (user.role === 'AGENCY' && user.agency) {
        user.agencyId = user.agency.id;
        console.log(`[OptionalAuthMiddleware] Agency ID: ${user.agencyId} attached.`);
      }
      
      // Attach user to request
      req.user = user;
      console.log('[OptionalAuthMiddleware] User attached to req.user.');
    } else {
      console.log('[OptionalAuthMiddleware] User not found in database. Proceeding without authentication.');
    }
  } catch (error) {
    console.warn('[OptionalAuthMiddleware] Token validation failed:', error.message, 'Proceeding without authentication.');
    // Don't throw error, just continue without setting req.user
  }

  next();
};
