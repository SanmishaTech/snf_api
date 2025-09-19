const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('http-errors');

// Get Dashboard Statistics
exports.getDashboardStats = async (req, res, next) => {
  try {
    const role = (req.user?.role || '').toUpperCase();
    const userDepotId = req.user?.depotId;

    // Build base filters for role-based access
    const whereConditions = {};
    
    // For DEPOT_ADMIN users, filter by their depot
    if ((role === 'DEPOT_ADMIN' || role === 'DEPOTADMIN' || role.includes('DEPOT')) && userDepotId) {
      whereConditions.depotId = userDepotId;
    }

    // Date ranges for calculations
    const currentDate = new Date();
    const lastMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastYearStart = new Date(currentDate.getFullYear() - 1, 0, 1);
    const currentYearStart = new Date(currentDate.getFullYear(), 0, 1);

    // Calculate statistics based on role
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
      calculateRevenue(whereConditions, currentYearStart, currentDate),
      
      // Last Month Revenue
      calculateRevenue(whereConditions, lastMonthStart, currentMonthStart),
      
      // Current Active Customers (currently active subscriptions + recent orders)
      getActiveCustomers(whereConditions),
      
      // Last Month Active Customers (for comparison)
      getLastMonthActiveCustomers(whereConditions, lastMonthStart, currentMonthStart),
      
      // Total Orders (current year)
      getTotalOrders(whereConditions, currentYearStart, currentDate),
      
      // Last Month Orders
      getTotalOrders(whereConditions, lastMonthStart, currentMonthStart),
      
      // Low Stock Items (depot variants below minimum)
      getLowStockItems(whereConditions),
      
      // Active Subscriptions count
      getActiveSubscriptionsCount(whereConditions)
    ]);

    // Calculate percentage changes
    const revenueChange = calculatePercentageChange(totalRevenue.currentMonth, lastMonthRevenue.currentMonth);
    const customersChange = calculatePercentageChange(activeCustomers, lastMonthCustomers);
    const ordersChange = calculatePercentageChange(totalOrders, lastMonthOrders);

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
      scope: role === 'DEPOT_ADMIN' ? 'depot' : 'global'
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
async function calculateRevenue(whereConditions, startDate, endDate) {
  const dateFilter = {
    gte: startDate,
    lte: endDate
  };

  // Revenue from SNF Orders
  const snfOrdersRevenue = await prisma.sNFOrder.aggregate({
    where: {
      ...whereConditions,
      createdAt: dateFilter,
      paymentStatus: 'PAID'
    },
    _sum: {
      totalAmount: true
    }
  });

  // Revenue from Subscriptions 
  const subscriptionsRevenue = await prisma.subscription.aggregate({
    where: {
      createdAt: dateFilter,
      paymentStatus: 'PAID',
      ...(whereConditions.depotId && {
        depotProductVariant: {
          depotId: whereConditions.depotId
        }
      })
    },
    _sum: {
      receivedamt: true
    }
  });

  // Current month revenue (for comparison)
  const currentMonthStart = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const currentMonthRevenue = await Promise.all([
    prisma.sNFOrder.aggregate({
      where: {
        ...whereConditions,
        createdAt: {
          gte: currentMonthStart,
          lte: endDate
        },
        paymentStatus: 'PAID'
      },
      _sum: {
        totalAmount: true
      }
    }),
    prisma.subscription.aggregate({
      where: {
        createdAt: {
          gte: currentMonthStart,
          lte: endDate
        },
        paymentStatus: 'PAID',
        ...(whereConditions.depotId && {
          depotProductVariant: {
            depotId: whereConditions.depotId
          }
        })
      },
      _sum: {
        receivedamt: true
      }
    })
  ]);

  const total = (snfOrdersRevenue._sum.totalAmount || 0) + (subscriptionsRevenue._sum.receivedamt || 0);
  const currentMonth = (currentMonthRevenue[0]._sum.totalAmount || 0) + (currentMonthRevenue[1]._sum.receivedamt || 0);

  return {
    total,
    currentMonth
  };
}

// Helper function to get currently active customers
async function getActiveCustomers(whereConditions) {
  const currentDate = new Date();
  
  // Get customers with currently active subscriptions (paid and not expired)
  const activeSubscriptionCustomers = await prisma.subscription.findMany({
    where: {
      paymentStatus: 'PAID', // Only count customers with PAID subscriptions
      expiryDate: {
        gte: currentDate // Not expired
      },
      ...(whereConditions.depotId && {
        depotProductVariant: {
          depotId: whereConditions.depotId
        }
      })
    },
    distinct: ['memberId'],
    select: {
      memberId: true
    }
  });

  // Get customers with recent SNF orders (last 30 days)
  const recentOrderDate = new Date();
  recentOrderDate.setDate(recentOrderDate.getDate() - 30);
  
  const recentSNFCustomers = await prisma.sNFOrder.findMany({
    where: {
      ...whereConditions,
      createdAt: {
        gte: recentOrderDate
      },
      memberId: {
        not: null
      }
    },
    distinct: ['memberId'],
    select: {
      memberId: true
    }
  });

  // Combine and get unique count of currently active customers
  const uniqueCustomers = new Set([
    ...activeSubscriptionCustomers.map(c => `member_${c.memberId}`),
    ...recentSNFCustomers.map(c => `member_${c.memberId}`)
  ]);

  return uniqueCustomers.size;
}

// Helper function to get last month's active customers (for comparison)
async function getLastMonthActiveCustomers(whereConditions, startDate, endDate) {
  // Get customers who had active subscriptions during last month
  const lastMonthSubscriptionCustomers = await prisma.subscription.findMany({
    where: {
      paymentStatus: 'PAID', // Only count PAID subscriptions
      createdAt: {
        lte: endDate // Created before end of last month
      },
      expiryDate: {
        gte: startDate // Was still active during last month
      },
      ...(whereConditions.depotId && {
        depotProductVariant: {
          depotId: whereConditions.depotId
        }
      })
    },
    distinct: ['memberId'],
    select: {
      memberId: true
    }
  });

  // Get customers with SNF orders during last month
  const lastMonthSNFCustomers = await prisma.sNFOrder.findMany({
    where: {
      ...whereConditions,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      memberId: {
        not: null
      }
    },
    distinct: ['memberId'],
    select: {
      memberId: true
    }
  });

  // Combine and get unique count
  const uniqueCustomers = new Set([
    ...lastMonthSubscriptionCustomers.map(c => `member_${c.memberId}`),
    ...lastMonthSNFCustomers.map(c => `member_${c.memberId}`)
  ]);

  return uniqueCustomers.size;
}

// Helper function to get total orders count
async function getTotalOrders(whereConditions, startDate, endDate) {
  const dateFilter = {
    gte: startDate,
    lte: endDate
  };

  const [snfOrdersCount, subscriptionsCount] = await Promise.all([
    prisma.sNFOrder.count({
      where: {
        ...whereConditions,
        createdAt: dateFilter
      }
    }),
    prisma.subscription.count({
      where: {
        createdAt: dateFilter,
        ...(whereConditions.depotId && {
          depotProductVariant: {
            depotId: whereConditions.depotId
          }
        })
      }
    })
  ]);

  return snfOrdersCount + subscriptionsCount;
}

// Helper function to get low stock items count
async function getLowStockItems(whereConditions) {
  // Get all depot variants and filter those where closingQty < minimumQty
  const variants = await prisma.depotProductVariant.findMany({
    where: {
      ...whereConditions,
      notInStock: false,
      isHidden: false
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
async function getActiveSubscriptionsCount(whereConditions) {
  const currentDate = new Date();
  
  const activeSubscriptionsCount = await prisma.subscription.count({
    where: {
      paymentStatus: 'PAID', // Only count PAID subscriptions
      expiryDate: {
        gte: currentDate // Not expired
      },
      ...(whereConditions.depotId && {
        depotProductVariant: {
          depotId: whereConditions.depotId
        }
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

    // Build base filters for role-based access
    const whereConditions = {};
    
    // For DEPOT_ADMIN users, filter by their depot
    if ((role === 'DEPOT_ADMIN' || role === 'DEPOTADMIN' || role.includes('DEPOT')) && userDepotId) {
      whereConditions.depotId = userDepotId;
    }

    // Get recent orders and activities
    const [recentSNFOrders, recentSubscriptions] = await Promise.all([
      // Recent SNF Orders
      prisma.sNFOrder.findMany({
        where: whereConditions,
        include: {
          member: {
            include: {
              user: {
                select: {
                  name: true,
                  mobile: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: Math.ceil(limit / 2)
      }),

      // Recent Subscriptions
      prisma.subscription.findMany({
        where: {
          ...(whereConditions.depotId && {
            depotProductVariant: {
              depotId: whereConditions.depotId
            }
          })
        },
        include: {
          member: {
            include: {
              user: {
                select: {
                  name: true,
                  mobile: true
                }
              }
            }
          },
          product: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: Math.ceil(limit / 2)
      })
    ]);

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
