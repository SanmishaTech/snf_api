const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all subscriptions with pagination, sorting, and filtering
const getAllSubscriptions = async (req, res) => {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', paymentStatus, productId, memberName, memberEmail, memberMobile, searchTerm, subscriptionDate, unassigned, daysUntilExpiry, expiryStatus } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const offset = (pageNum - 1) * limitNum;

  let whereClause = {};
  let userWhereClause = {};

  if (paymentStatus) {
    whereClause.paymentStatus = paymentStatus;
  }
  if (productId) {
    whereClause.productId = parseInt(productId, 10);
  }

  if (searchTerm) { // Prioritize searchTerm for general name search
    userWhereClause.name = { contains: searchTerm };
  } else if (memberName) { // Fallback to memberName if searchTerm is not provided
    userWhereClause.name = { contains: memberName };
  }
  if (memberEmail) {
    userWhereClause.email = { contains: memberEmail, mode: 'insensitive' };
  }
  if (memberMobile) {
    // Assuming mobile in User model is stored as a number, convert query string to number if needed
    // If it's a string, adjust accordingly.
    // For simplicity, direct equality check. Partial match might be more complex for numbers.
    const mobileNum = parseInt(memberMobile, 10);
    if (!isNaN(mobileNum)) {
        userWhereClause.mobile = mobileNum;
    }
  }
  
  if (subscriptionDate) {
    const date = new Date(subscriptionDate);
    const nextDay = new Date(subscriptionDate);
    nextDay.setDate(date.getDate() + 1);
    whereClause.startDate = {
      gte: date,
      lt: nextDay,
    };
  }

  // Filter for unassigned subscriptions (no agency assigned)
  if (unassigned === 'true') {
    whereClause.agencyId = null;
  }

  // Filter by days until expiry
  if (daysUntilExpiry) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + parseInt(daysUntilExpiry, 10));
    futureDate.setHours(23, 59, 59, 999);
    whereClause.expiryDate = {
      gte: today,
      lte: futureDate,
    };
  }

  // Filter by expiry status
  if (expiryStatus && expiryStatus !== 'ALL') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiryStatus === 'ACTIVE') {
      // Not expired yet
      whereClause.expiryDate = {
        gte: today,
      };
    } else if (expiryStatus === 'EXPIRED') {
      // Already expired
      whereClause.expiryDate = {
        lt: today,
      };
    } else if (expiryStatus === 'EXPIRING_SOON') {
      // Expiring within next 7 days
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(today.getDate() + 7);
      sevenDaysFromNow.setHours(23, 59, 59, 999);
      whereClause.expiryDate = {
        gte: today,
        lte: sevenDaysFromNow,
      };
    }
  }

  // If there are any user-specific filters, apply them to the member relation
  if (Object.keys(userWhereClause).length > 0) {
    whereClause.member = {
      user: userWhereClause
    };
  }

  try {
    const subscriptions = await prisma.subscription.findMany({
      where: whereClause,
      include: {
        member: {
          include: {
            user: true // Fetch full user object
          }
        },
        product: true, // Fetch full product object
        agency: {
          include: {
            user: true // Fetch full user object for the agency
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: offset,
      take: limitNum,
    });

    const totalSubscriptions = await prisma.subscription.count({
      where: whereClause,
    });

    res.status(200).json({
      data: subscriptions,
      totalPages: Math.ceil(totalSubscriptions / limitNum),
      currentPage: pageNum,
      totalCount: totalSubscriptions,
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ message: 'Error fetching subscriptions', error: error.message });
  }
};

module.exports = {
  getAllSubscriptions,
};
