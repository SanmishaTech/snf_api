const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('http-errors');

// Get Dashboard Statistics
exports.getDashboardStats = async (req, res, next) => {
  try {
    const role = (req.user?.role || '').toUpperCase();
    const userDepotId = req.user?.depotId;
    const type = (req.query.type || 'all').toLowerCase(); // 'indraai', 'snf', or 'all'

    // Build base filters for role-based access
    const whereConditions = {};
    
    // For DEPOT_ADMIN users, filter by their depot
    if ((role === 'DEPOT_ADMIN' || role === 'DEPOTADMIN' || role.includes('DEPOT')) && userDepotId) {
      whereConditions.depotId = userDepotId;
    }

    // For AGENCY users, filter by their agency ID
    if (role === 'AGENCY') {
      // Prioritize agencyId already on the user object (from auth middleware)
      if (req.user?.agencyId) {
        whereConditions.agencyId = req.user.agencyId;
      } else {
        // Fallback: lookup if not attached
        const agency = await prisma.agency.findUnique({
          where: { userId: req.user.id },
          select: { id: true }
        });
        if (agency) {
          whereConditions.agencyId = agency.id;
        } else {
          // If role is AGENCY but no agency record exists yet, 
          // force empty results instead of global stats.
          whereConditions.agencyId = -1; 
        }
      }
    }

    // Date ranges for calculations
    const currentDate = new Date();
    const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentYearStart = new Date(currentDate.getFullYear(), 0, 1);

    // Calculate statistics based on role and type
    const [
      totalRevenue,
      lastMonthRevenue,
      activeCustomers,
      lastMonthCustomers,
      totalOrders,
      lastMonthOrders,
      lowStockItems,
      activeSubscriptions
    ] = await Promise.all([
      // Total Revenue (current year)
      calculateRevenue(whereConditions, currentYearStart, currentDate, type),
      
      // Last Month Revenue
      calculateRevenue(whereConditions, lastMonthStart, currentMonthStart, type),
      
      // Current Active Customers
      getActiveCustomers(whereConditions, type),
      
      // Last Month Active Customers
      getLastMonthActiveCustomers(whereConditions, lastMonthStart, currentMonthStart, type),
      
      // Total Orders (current year)
      getTotalOrders(whereConditions, currentYearStart, currentDate, type),
      
      // Last Month Orders
      getTotalOrders(whereConditions, lastMonthStart, currentMonthStart, type),
      
      // Low Stock Items
      getLowStockItems(whereConditions, type),
      
      // Active Subscriptions count
      getActiveSubscriptionsCount(whereConditions, type)
    ]);

    // Calculate percentage changes
    const revenueChange = calculatePercentageChange(totalRevenue.currentMonth, lastMonthRevenue.currentMonth);
    const customersChange = calculatePercentageChange(activeCustomers, lastMonthCustomers);
    const ordersChange = calculatePercentageChange(totalOrders, lastMonthOrders);

    // Correctly identify the dashboard scope for the frontend
    let dashboardScope = type !== 'all' ? type : 'global';
    if (role === 'AGENCY') {
        dashboardScope = 'agency';
    } else if (role === 'DEPOT_ADMIN' || role === 'DEPOTADMIN' || role.includes('DEPOT')) {
        dashboardScope = 'depot';
    }

    const stats = {
      totalRevenue: Math.round(totalRevenue.total || 0),
      revenueChange: revenueChange,
      activeCustomers: activeCustomers || 0,
      customersChange: customersChange,
      totalOrders: totalOrders || 0,
      ordersChange: ordersChange,
      lowStockItems: lowStockItems || 0,
      activeSubscriptions: activeSubscriptions || 0,
      lastUpdated: new Date().toISOString(),
      scope: dashboardScope
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('[getDashboardStats]', error);
    return next(createError(500, error.message || 'Failed to fetch dashboard statistics'));
  }
};


// Helper function to calculate revenue from different sources
async function calculateRevenue(whereConditions, startDate, endDate, type = 'all') {
  const dateFilter = {
    gte: startDate,
    lte: endDate
  };

  let total = 0;
  let currentMonth = 0;

  // Revenue from SNF Orders (only for 'snf' or 'all')
  if (type === 'snf' || type === 'all') {
    const snfOrdersRevenue = await prisma.sNFOrder.aggregate({
      where: {
        ...(whereConditions.depotId && { depotId: whereConditions.depotId }),
        ...(whereConditions.agencyId && { id: -1 }),
        createdAt: dateFilter,
        paymentStatus: 'PAID'
      },
      _sum: {
        totalAmount: true
      }
    });
    total += snfOrdersRevenue._sum.totalAmount || 0;

    const currentMonthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const snfCurrentMonthRevenue = await prisma.sNFOrder.aggregate({
      where: {
        ...(whereConditions.depotId && { depotId: whereConditions.depotId }),
        ...(whereConditions.agencyId && { id: -1 }),
        createdAt: { gte: currentMonthStart, lte: endDate },
        paymentStatus: 'PAID'
      },
      _sum: {
        totalAmount: true
      }
    });
    currentMonth += snfCurrentMonthRevenue._sum.totalAmount || 0;
  }

  // Revenue from Subscriptions (only for 'indraai' or 'all')
  if (type === 'indraai' || type === 'all') {
    const subscriptionsRevenue = await prisma.subscription.aggregate({
      where: {
        createdAt: dateFilter,
        paymentStatus: 'PAID',
        ...(whereConditions.agencyId && { agencyId: whereConditions.agencyId }),
        ...(whereConditions.depotId && {
          depotProductVariant: { depotId: whereConditions.depotId }
        })
      },
      _sum: {
        receivedamt: true
      }
    });
    total += subscriptionsRevenue._sum.receivedamt || 0;

    const currentMonthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const subCurrentMonthRevenue = await prisma.subscription.aggregate({
      where: {
        createdAt: { gte: currentMonthStart, lte: endDate },
        paymentStatus: 'PAID',
        ...(whereConditions.agencyId && { agencyId: whereConditions.agencyId }),
        ...(whereConditions.depotId && {
          depotProductVariant: { depotId: whereConditions.depotId }
        })
      },
      _sum: {
        receivedamt: true
      }
    });
    currentMonth += subCurrentMonthRevenue._sum.receivedamt || 0;
  }

  return {
    total,
    currentMonth
  };
}

// Helper function to get currently active customers
async function getActiveCustomers(whereConditions, type = 'all') {
  const currentDate = new Date();
  let uniqueCustomers = new Set();
  
  if (type === 'indraai' || type === 'all') {
    const activeSubscriptionCustomers = await prisma.subscription.findMany({
      where: {
        paymentStatus: 'PAID',
        expiryDate: { gte: currentDate },
        ...(whereConditions.agencyId && { agencyId: whereConditions.agencyId }),
        ...(whereConditions.depotId && {
          depotProductVariant: { depotId: whereConditions.depotId }
        })
      },
      distinct: ['memberId'],
      select: { memberId: true }
    });
    activeSubscriptionCustomers.forEach(c => uniqueCustomers.add(`member_${c.memberId}`));
  }

  if (type === 'snf' || type === 'all') {
    const recentOrderDate = new Date();
    recentOrderDate.setDate(recentOrderDate.getDate() - 30);
    
    const recentSNFCustomers = await prisma.sNFOrder.findMany({
      where: {
        ...(whereConditions.depotId && { depotId: whereConditions.depotId }),
        ...(whereConditions.agencyId && { id: -1 }),
        createdAt: { gte: recentOrderDate },
        memberId: { not: null }
      },
      distinct: ['memberId'],
      select: { memberId: true }
    });
    recentSNFCustomers.forEach(c => uniqueCustomers.add(`member_${c.memberId}`));
  }

  return uniqueCustomers.size;
}

// Helper function to get last month's active customers (for comparison)
async function getLastMonthActiveCustomers(whereConditions, startDate, endDate, type = 'all') {
  let uniqueCustomers = new Set();

  if (type === 'indraai' || type === 'all') {
    const lastMonthSubscriptionCustomers = await prisma.subscription.findMany({
      where: {
        paymentStatus: 'PAID',
        createdAt: { lte: endDate },
        expiryDate: { gte: startDate },
        ...(whereConditions.agencyId && { agencyId: whereConditions.agencyId }),
        ...(whereConditions.depotId && {
          depotProductVariant: { depotId: whereConditions.depotId }
        })
      },
      distinct: ['memberId'],
      select: { memberId: true }
    });
    lastMonthSubscriptionCustomers.forEach(c => uniqueCustomers.add(`member_${c.memberId}`));
  }

  if (type === 'snf' || type === 'all') {
    const lastMonthSNFCustomers = await prisma.sNFOrder.findMany({
      where: {
        ...(whereConditions.depotId && { depotId: whereConditions.depotId }),
        ...(whereConditions.agencyId && { id: -1 }),
        createdAt: { gte: startDate, lte: endDate },
        memberId: { not: null }
      },
      distinct: ['memberId'],
      select: { memberId: true }
    });
    lastMonthSNFCustomers.forEach(c => uniqueCustomers.add(`member_${c.memberId}`));
  }

  return uniqueCustomers.size;
}

// Helper function to get total orders count
async function getTotalOrders(whereConditions, startDate, endDate, type = 'all') {
  const dateFilter = {
    gte: startDate,
    lte: endDate
  };

  let totalCount = 0;

  if (type === 'snf' || type === 'all') {
    const snfOrdersCount = await prisma.sNFOrder.count({
      where: {
        ...(whereConditions.depotId && { depotId: whereConditions.depotId }),
        ...(whereConditions.agencyId && { id: -1 }),
        createdAt: dateFilter
      }
    });
    totalCount += snfOrdersCount;
  }

  if (type === 'indraai' || type === 'all') {
    const subscriptionsCount = await prisma.subscription.count({
      where: {
        createdAt: dateFilter,
        ...(whereConditions.agencyId && { agencyId: whereConditions.agencyId }),
        ...(whereConditions.depotId && {
          depotProductVariant: { depotId: whereConditions.depotId }
        })
      }
    });
    totalCount += subscriptionsCount;
  }

  return totalCount;
}

// Helper function to get low stock items count
async function getLowStockItems(whereConditions, type = 'all') {
  // Get all depot variants and filter those where closingQty < minimumQty
  const variants = await prisma.depotProductVariant.findMany({
    where: {
      ...(whereConditions.depotId && { depotId: whereConditions.depotId }),
      notInStock: false,
      isHidden: false,
      product: {
        ...(type === 'indraai' && { isDairyProduct: true }),
        ...(type === 'snf' && { isDairyProduct: false }),
      }
    },
    select: {
      id: true,
      closingQty: true,
      minimumQty: true
    }
  });

  // Filter variants where closingQty is below minimumQty
  const lowStockVariants = variants.filter(variant => 
    variant.closingQty < variant.minimumQty
  );

  return lowStockVariants.length;
}

// Helper function to get active subscriptions count
async function getActiveSubscriptionsCount(whereConditions, type = 'all') {
  // For SNF dashboard, subscriptions are always 0
  if (type === 'snf') return 0;

  const currentDate = new Date();
  const activeSubscriptionsCount = await prisma.subscription.count({
    where: {
      paymentStatus: 'PAID',
      expiryDate: { gte: currentDate },
      ...(whereConditions.agencyId && { agencyId: whereConditions.agencyId }),
      ...(whereConditions.depotId && {
        depotProductVariant: { depotId: whereConditions.depotId }
      })
    }
  });

  return activeSubscriptionsCount;
}

// Helper function to calculate percentage change
function calculatePercentageChange(current, previous) {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}


// Get recent activities for dashboard
exports.getRecentActivities = async (req, res, next) => {
  try {
    const role = (req.user?.role || '').toUpperCase();
    const userDepotId = req.user?.depotId;
    const limit = parseInt(req.query.limit) || 10;
    const type = (req.query.type || 'all').toLowerCase();

    // Build base filters for role-based access
    const whereConditions = {};
    
    // For DEPOT_ADMIN users, filter by their depot
    if ((role === 'DEPOT_ADMIN' || role === 'DEPOTADMIN' || role.includes('DEPOT')) && userDepotId) {
      whereConditions.depotId = userDepotId;
    }

    // For AGENCY users, filter by their agency ID
    if (role === 'AGENCY') {
      if (req.user?.agencyId) {
        whereConditions.agencyId = req.user.agencyId;
      } else {
        const agency = await prisma.agency.findUnique({
          where: { userId: req.user.id },
          select: { id: true }
        });
        if (agency) {
          whereConditions.agencyId = agency.id;
        } else {
          whereConditions.agencyId = -1;
        }
      }
    }

    // Get recent orders and activities
    let recentSNFOrders = [];
    let recentSubscriptions = [];

    const promises = [];

    // Recent SNF Orders (only for 'snf' or 'all')
    if (type === 'snf' || type === 'all') {
      promises.push(
        prisma.sNFOrder.findMany({
          where: {
            ...(whereConditions.depotId && { depotId: whereConditions.depotId }),
            ...(whereConditions.agencyId && { id: -1 })
          },
          include: {
            member: {
              include: {
                user: {
                  select: { name: true, mobile: true }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: limit
        }).then(res => recentSNFOrders = res)
      );
    }

    // Recent Subscriptions (only for 'indraai' or 'all')
    if (type === 'indraai' || type === 'all') {
      promises.push(
        prisma.subscription.findMany({
          where: {
            ...(whereConditions.agencyId && { agencyId: whereConditions.agencyId }),
            ...(whereConditions.depotId && {
              depotProductVariant: { depotId: whereConditions.depotId }
            })
          },
          include: {
            member: {
              include: {
                user: {
                  select: { name: true, mobile: true }
                }
              }
            },
            product: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: limit
        }).then(res => recentSubscriptions = res)
      );
    }

    await Promise.all(promises);

    // Combine and format activities
    const activities = [];

    recentSNFOrders.forEach(order => {
      activities.push({
        id: `snf_${order.id}`,
        type: 'snf_order',
        title: `New SNF Order #${order.id}`,
        description: `₹${order.totalAmount} - ${order.member?.user?.name || order.name || 'Guest'}`,
        timestamp: order.createdAt,
        status: order.paymentStatus
      });
    });

    recentSubscriptions.forEach(subscription => {
      activities.push({
        id: `sub_${subscription.id}`,
        type: 'subscription',
        title: `New Subscription`,
        description: `${subscription.product?.name || 'Product'} - ${subscription.member?.user?.name || 'Member'}`,
        timestamp: subscription.createdAt,
        status: subscription.paymentStatus
      });
    });

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedActivities = activities.slice(0, limit);

    res.json({
      success: true,
      data: limitedActivities
    });

  } catch (error) {
    console.error('[getRecentActivities]', error);
    return next(createError(500, error.message || 'Failed to fetch recent activities'));
  }
};

