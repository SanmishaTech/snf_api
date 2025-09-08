const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const createError = require('http-errors');

// Purchase Order Report with multiple grouping levels (from VendorOrder table)
exports.getPurchaseOrderReport = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      farmerId,
      depotId,
      variantId,
      status,
      groupBy = 'farmer,depot,variant', // comma-separated grouping levels
      productId,
      agencyId
    } = req.query;

    // Build where clause for filtering
    const where = {};
    const role = (req.user?.role || '').toUpperCase();
    const userVendorId = req.user?.vendorId;
    if (role === 'VENDOR' && !userVendorId) {
      return next(createError(403, 'Vendor user is not linked to any farmer/vendor record'));
    }
    
    // Date range filter
    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        where.orderDate.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.orderDate.lte = end;
      }
    }

    // Other filters
    // Enforce vendor scoping for VENDOR role
    if (role === 'VENDOR') {
      where.vendorId = userVendorId;
    } else if (farmerId) {
      where.vendorId = parseInt(farmerId, 10);
    }
    if (status) where.status = status;

    // Fetch vendor order data with details
    const orders = await prisma.vendorOrder.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            isDairySupplier: true // Use this to identify dairy suppliers/farmers
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                categoryId: true
              }
            },
            depot: {
              select: {
                id: true,
                name: true,
                address: true,
                city: true
              }
            },
            depotVariant: {
              select: {
                id: true,
                name: true,
                mrp: true,
                purchasePrice: true
              }
            },
            agency: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        deliveredBy: {
          select: {
            id: true,
            name: true
          }
        },
        receivedBy: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { orderDate: 'desc' },
        { id: 'desc' }
      ]
    });

    // Process and group the data
    const groupedData = processGroupedData(orders, groupBy.split(','));

    // Calculate totals
    const totals = calculateTotals(orders);

    res.json({
      success: true,
      data: {
        report: groupedData,
        totals,
        filters: {
          startDate,
          endDate,
          farmerId,
          depotId,
          variantId,
          status,
          groupBy
        },
        recordCount: orders.length
      }
    });

  } catch (error) {
    console.error('[getPurchaseOrderReport]', error);
    return next(createError(500, error.message || 'Failed to generate purchase order report'));
  }
};

// Delivery Agencies Report: filters (agencies, areas)
exports.getDeliveryFilters = async (req, res, next) => {
  try {
    let agencies = [];
    let areas = [];
    try {
      // If the logged-in user is an AGENCY, only return their own agency
      const role = (req.user?.role || '').toUpperCase();
      const userAgencyId = req.user?.agencyId;
      if (role === 'AGENCY' && userAgencyId) {
        const agency = await prisma.agency.findUnique({
          where: { id: userAgencyId },
          select: { id: true, name: true, city: true }
        });
        agencies = agency ? [agency] : [];
      } else {
        agencies = await prisma.agency.findMany({ 
          select: { id: true, name: true, city: true }, 
          orderBy: { name: 'asc' } 
        });
      }
    } catch (e) {
      agencies = [];
    }
    try {
      // Get locations for area filtering (used in delivery addresses)
      areas = await prisma.location.findMany({ 
        select: { 
          id: true, 
          name: true, 
          city: { select: { name: true } }
        }, 
        orderBy: { name: 'asc' },
        include: {
          city: { select: { name: true } }
        }
      });
      
      // Format areas to match expected structure
      areas = areas.map(location => ({
        id: location.id,
        name: location.name,
        city: location.city?.name || 'Unknown City'
      }));
    } catch (e) {
      // Fallback to area masters if locations don't work
      try {
        areas = await prisma.areaMaster.findMany({ 
          select: { id: true, name: true }, 
          orderBy: { name: 'asc' } 
        });
        areas = areas.map(area => ({
          id: area.id,
          name: area.name,
          city: 'Area Master'
        }));
      } catch (e2) {
        areas = [];
      }
    }
    return res.json({ success: true, data: { agencies, areas } });
  } catch (error) {
    console.error('[getDeliveryFilters]', error);
    return next(createError(500, error.message || 'Failed to fetch delivery filters'));
  }
};

// Delivery Agencies Report (group by agency -> area -> status)
exports.getDeliveryAgenciesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, agencyId, areaId, status, groupBy = 'agency,area,status' } = req.query;

    // Build where clause for delivery schedule entries
    const where = {};
    const role = (req.user?.role || '').toUpperCase();
    const userAgencyId = req.user?.agencyId;
    if (role === 'AGENCY' && !userAgencyId) {
      return next(createError(403, 'Agency user is not assigned to any agency'));
    }
    if (startDate || endDate) {
      where.deliveryDate = {};
      if (startDate) where.deliveryDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.deliveryDate.lte = end;
      }
    }
    if (status) where.status = status;
    // Determine effective agency filter:
    // - If user is AGENCY, enforce their agencyId
    // - Else if admin provided agencyId in query, use that
    const parsedAgencyId = agencyId ? parseInt(agencyId, 10) : undefined;
    const requestedAgencyId = role === 'AGENCY' ? userAgencyId : parsedAgencyId;
    if (requestedAgencyId) {
      // Use OR to cover both agentId and subscription.agencyId
      where.OR = [
        { agentId: requestedAgencyId },
        { subscription: { agencyId: requestedAgencyId } }
      ];
    }
    
    // For area filtering, we need to filter through the delivery address location
    if (areaId) {
      where.deliveryAddress = {
        locationId: parseInt(areaId, 10)
      };
    }

    // Fetch delivery schedule entries with all related data
    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where,
      include: {
        subscription: {
          include: {
            agency: { select: { id: true, name: true, city: true } },
            product: { select: { id: true, name: true } },
            member: {
              include: {
                user: { select: { id: true, name: true, mobile: true } }
              }
            }
          }
        },
        deliveryAddress: {
          include: {
            location: {
              include: {
                city: { select: { id: true, name: true } }
              }
            }
          }
        },
        member: {
          include: {
            user: { select: { id: true, name: true, mobile: true } }
          }
        },
        DepotProductVariant: { select: { id: true, name: true, mrp: true, purchasePrice: true } },
        product: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true, city: true } }
      },
      orderBy: [{ deliveryDate: 'desc' }, { id: 'desc' }]
    });

    // Transform to flat structure expected by frontend exporter
    const flat = [];
    deliveries.forEach(d => {
      // Calculate amount based on subscription rate and quantity
      const rate = d.subscription?.rate || 0;
      const amount = (d.quantity || 1) * rate;
      
      // Determine area information - if delivery address exists, check its location
      // If no delivery address or location is present, show Any
      let areaName, areaIdValue, city;
      
      if (d.deliveryAddress && d.deliveryAddress.locationId) {
        // Delivery address exists with a location, use it
        areaName = d.deliveryAddress.location?.name || 'Any';
        areaIdValue = d.deliveryAddress.locationId;
        city = d.deliveryAddress.location?.city?.name || d.deliveryAddress.city || 'Any';
      } else {
        // No delivery address or no location assigned to delivery address, use Any
        areaName = 'Any';
        areaIdValue = 'any';
        city = d.deliveryAddress?.city || d.agent?.city || 'Any';
      }
      
      flat.push({
        orderId: `DSE-${d.id}`,
        deliveryDate: d.deliveryDate,
        status: d.status,
        productId: d.product?.id || d.subscription?.product?.id,
        productName: d.product?.name || d.subscription?.product?.name || 'Unknown Product',
        variantId: d.DepotProductVariant?.id,
        variantName: d.DepotProductVariant?.name || 'Default Variant',
        quantity: d.quantity || 1,
        amount: amount,
        customerId: d.member?.id || d.subscription?.member?.id,
        customerName: d.member?.name || d.subscription?.member?.name || 'Unknown Customer',
        customerMobile: d.member?.user?.mobile || d.subscription?.member?.user?.mobile || '',
        deliveryAddress: d.deliveryAddress ? 
          `${d.deliveryAddress.plotBuilding}, ${d.deliveryAddress.streetArea}, ${d.deliveryAddress.city}` : 
          'No address specified',
        areaId: areaIdValue,
        areaName: areaName,
        city: city,
        agencyId: d.agent?.id || d.subscription?.agency?.id,
        agencyName: d.agent?.name || d.subscription?.agency?.name || 'Unknown Agency',
        deliveredBy: d.agent?.name || 'Not assigned',
        deliveryTime: '', // Not available in current schema
        subscriptionId: d.subscriptionId,
        rate: rate,
        notes: d.adminNotes || ''
      });
    });

    // Group
    const levels = (groupBy || '').split(',').filter(Boolean);
    const grouped = groupDeliveries(flat, levels);

    const totals = {
      totalDeliveries: flat.length,
      totalItems: flat.length,
      totalQuantity: flat.reduce((s, x) => s + (x.quantity || 0), 0),
      totalAmount: flat.reduce((s, x) => s + (x.amount || 0), 0),
      deliveredCount: flat.filter(x => (x.status || '').toLowerCase() === 'delivered').length,
      pendingCount: flat.filter(x => (x.status || '').toLowerCase() === 'pending').length,
      avgDeliveryValue: flat.length ? flat.reduce((s, x) => s + (x.amount || 0), 0) / flat.length : 0
    };

    return res.json({
      success: true,
      data: {
        report: grouped,
        totals,
        filters: { startDate, endDate, agencyId: requestedAgencyId || agencyId, areaId, status, groupBy },
        recordCount: flat.length
      }
    });
  } catch (error) {
    console.error('[getDeliveryAgenciesReport]', error);
    return next(createError(500, error.message || 'Failed to generate delivery agencies report'));
  }
};

// Delivery Summaries Report (agency-wise status counts in tabular format)
exports.getDeliverySummariesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, agencyId } = req.query;

    // Build where clause for delivery schedule entries
    const where = {};
    const role = (req.user?.role || '').toUpperCase();
    const userAgencyId = req.user?.agencyId;
    if (role === 'AGENCY' && !userAgencyId) {
      return next(createError(403, 'Agency user is not assigned to any agency'));
    }
    if (startDate || endDate) {
      where.deliveryDate = {};
      if (startDate) where.deliveryDate.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.deliveryDate.lte = end;
      }
    }
    // Apply agency scoping: enforce for AGENCY users; allow admin to filter by query param if provided
    const parsedAgencyId = agencyId ? parseInt(agencyId, 10) : undefined;
    const requestedAgencyId = role === 'AGENCY' ? userAgencyId : parsedAgencyId;
    if (requestedAgencyId) {
      where.OR = [
        { agentId: requestedAgencyId },
        { subscription: { agencyId: requestedAgencyId } }
      ];
    }

    // Fetch delivery schedule entries with agency and status information
    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where,
      include: {
        subscription: {
          include: {
            agency: { select: { id: true, name: true, city: true } }
          }
        },
        agent: { select: { id: true, name: true, city: true } }
      },
      orderBy: [{ deliveryDate: 'desc' }]
    });

    // Group by agency and count status-wise
    const agencySummary = new Map();
    const statusSet = new Set();

    deliveries.forEach(d => {
      const agencyId = d.agent?.id || d.subscription?.agency?.id;
      const agencyName = d.agent?.name || d.subscription?.agency?.name || 'Unknown Agency';
      const agencyCity = d.agent?.city || d.subscription?.agency?.city || '';
      const status = d.status || 'UNKNOWN';
      
      statusSet.add(status);
      
      if (!agencySummary.has(agencyId)) {
        agencySummary.set(agencyId, {
          id: agencyId,
          name: agencyName,
          city: agencyCity,
          statusCounts: {},
          totalCount: 0
        });
      }
      
      const agency = agencySummary.get(agencyId);
      agency.statusCounts[status] = (agency.statusCounts[status] || 0) + 1;
      agency.totalCount += 1;
    });

    // Convert to array format
    const summaryData = Array.from(agencySummary.values());
    const statusList = Array.from(statusSet).sort();

    // Calculate totals
    const totals = {
      totalDeliveries: deliveries.length,
      totalAgencies: summaryData.length,
      statusTotals: {}
    };
    
    statusList.forEach(status => {
      totals.statusTotals[status] = summaryData.reduce((sum, agency) => 
        sum + (agency.statusCounts[status] || 0), 0
      );
    });

    return res.json({
      success: true,
      data: {
        summary: summaryData,
        statusList: statusList,
        totals,
        filters: { startDate, endDate, agencyId: requestedAgencyId || agencyId },
        recordCount: deliveries.length
      }
    });
  } catch (error) {
    console.error('[getDeliverySummariesReport]', error);
    return next(createError(500, error.message || 'Failed to generate delivery summaries report'));
  }
};

function groupDeliveries(data, levels) {
  if (!levels || levels.length === 0) return data;
  const level = levels[0];
  const groups = data.reduce((acc, row) => {
    const key = level === 'agency' ? row.agencyId : level === 'area' ? row.areaId : row.status || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const result = [];
  Object.entries(groups).forEach(([id, rows]) => {
    const node = {
      level,
      id,
      name: level === 'agency' ? rows[0].agencyName : level === 'area' ? rows[0].areaName : rows[0].status,
      city: level === 'area' ? rows[0].city : undefined,
      data: [],
      totals: {
        totalQuantity: rows.reduce((s, r) => s + (r.quantity || 0), 0),
        totalAmount: rows.reduce((s, r) => s + (r.amount || 0), 0),
        itemCount: rows.length,
        deliveredCount: rows.filter(r => (r.status || '').toLowerCase() === 'delivered').length,
        pendingCount: rows.filter(r => (r.status || '').toLowerCase() === 'pending').length,
      }
    };
    if (levels.length > 1) {
      node.data = groupDeliveries(rows, levels.slice(1));
    } else {
      node.data = rows;
    }
    result.push(node);
  });
  return result;
}

// Helper function to process and group data
function processGroupedData(orders, groupByLevels) {
  const result = [];
  
  // Flatten order items for easier processing
  const flatData = [];
  
  orders.forEach(order => {
    order.items.forEach(item => {
      flatData.push({
        purchaseId: order.id,
        purchaseNo: order.poNumber || `ORD-${order.id}`,
        purchaseDate: order.orderDate,
        deliveryDate: order.deliveryDate,
        status: order.status || 'PENDING',
        
        // Vendor/Farmer info
        farmerId: order.vendor?.id,
        farmerName: order.vendor?.name || 'Unknown',
        isDairySupplier: order.vendor?.isDairySupplier,
        
        // Depot info (from item)
        depotId: item.depot?.id,
        depotName: item.depot?.name || 'N/A',
        depotCity: item.depot?.city,
        depotAddress: item.depot?.address,
        
        // Product/Variant info
        productId: item.product?.id,
        productName: item.product?.name || 'Unknown',
        productCategory: item.product?.categoryId,
        variantId: item.depotVariant?.id || item.depotVariantId,
        variantName: item.depotVariant?.name || 'N/A',
        variantMrp: item.depotVariant?.mrp,
        
        // Quantities and amounts
        quantity: item.quantity,
        deliveredQuantity: item.deliveredQuantity || 0,
        receivedQuantity: item.receivedQuantity || 0,
        supervisorQuantity: item.supervisorQuantity || 0,
        purchaseRate: item.priceAtPurchase,
        amount: item.quantity * item.priceAtPurchase,
        
        // Agency info
        agencyId: item.agency?.id,
        agencyName: item.agency?.name || 'N/A',
        
        // Delivery info
        deliveredBy: order.deliveredBy?.name,
        receivedBy: order.receivedBy?.name
      });
    });
  });

  // Group data based on specified levels
  if (groupByLevels.includes('farmer')) {
    const farmerGroups = groupBy(flatData, 'farmerId');
    
    Object.entries(farmerGroups).forEach(([farmerId, farmerData]) => {
      const farmerGroup = {
        level: 'farmer',
        id: farmerId,
        name: farmerData[0].farmerName,
        data: [],
        totals: calculateGroupTotals(farmerData)
      };

      if (groupByLevels.includes('depot')) {
        const depotGroups = groupBy(farmerData, 'depotId');
        
        Object.entries(depotGroups).forEach(([depotId, depotData]) => {
          const depotGroup = {
            level: 'depot',
            id: depotId,
            name: depotData[0].depotName,
            location: depotData[0].depotCity,
            data: [],
            totals: calculateGroupTotals(depotData)
          };

          if (groupByLevels.includes('variant')) {
            const variantGroups = groupBy(depotData, 'variantId');
            
            Object.entries(variantGroups).forEach(([variantId, variantData]) => {
              const variantGroup = {
                level: 'variant',
                id: variantId,
                name: variantData[0].variantName,
                productName: variantData[0].productName,
                unit: '',
                data: variantData,
                totals: calculateGroupTotals(variantData)
              };
              
              depotGroup.data.push(variantGroup);
            });
          } else {
            depotGroup.data = depotData;
          }

          farmerGroup.data.push(depotGroup);
        });
      } else if (groupByLevels.includes('variant')) {
        const variantGroups = groupBy(farmerData, 'variantId');
        
        Object.entries(variantGroups).forEach(([variantId, variantData]) => {
          const variantGroup = {
              level: 'variant',
              id: variantId,
              name: variantData[0].variantName,
              productName: variantData[0].productName,
              unit: '',
            data: variantData,
            totals: calculateGroupTotals(variantData)
          };
          
          farmerGroup.data.push(variantGroup);
        });
      } else {
        farmerGroup.data = farmerData;
      }

      result.push(farmerGroup);
    });
  } else if (groupByLevels.includes('depot')) {
    const depotGroups = groupBy(flatData, 'depotId');
    
    Object.entries(depotGroups).forEach(([depotId, depotData]) => {
      const depotGroup = {
        level: 'depot',
        id: depotId,
        name: depotData[0].depotName,
        location: depotData[0].depotCity,
        data: [],
        totals: calculateGroupTotals(depotData)
      };

      if (groupByLevels.includes('variant')) {
        const variantGroups = groupBy(depotData, 'variantId');
        
        Object.entries(variantGroups).forEach(([variantId, variantData]) => {
          const variantGroup = {
            level: 'variant',
            id: variantId,
            name: variantData[0].variantName,
            productName: variantData[0].productName,
            unit: '',
            data: variantData,
            totals: calculateGroupTotals(variantData)
          };
          
          depotGroup.data.push(variantGroup);
        });
      } else {
        depotGroup.data = depotData;
      }

      result.push(depotGroup);
    });
  } else if (groupByLevels.includes('variant')) {
    const variantGroups = groupBy(flatData, 'variantId');
    
    Object.entries(variantGroups).forEach(([variantId, variantData]) => {
      const variantGroup = {
        level: 'variant',
        id: variantId,
        name: variantData[0].variantName,
        productName: variantData[0].productName,
        unit: '',
        data: variantData,
        totals: calculateGroupTotals(variantData)
      };
      
      result.push(variantGroup);
    });
  } else {
    // No grouping, return flat data
    return flatData;
  }

  return result;
}

// Helper function to group array by key
function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = item[key] || 'undefined';
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

// Calculate totals for a group
function calculateGroupTotals(data) {
  return {
    totalQuantity: data.reduce((sum, item) => sum + (item.quantity || 0), 0),
    totalAmount: data.reduce((sum, item) => sum + (item.amount || 0), 0),
    itemCount: data.length,
    avgRate: data.length > 0 
      ? data.reduce((sum, item) => sum + (item.purchaseRate || 0), 0) / data.length 
      : 0
  };
}

// Calculate overall totals
function calculateTotals(orders) {
  let totalQuantity = 0;
  let totalAmount = 0;
  let itemCount = 0;

  orders.forEach(order => {
    order.items.forEach(item => {
      totalQuantity += item.quantity || 0;
      totalAmount += ((item.quantity || 0) * (item.priceAtPurchase || 0));
      itemCount++;
    });
  });

  return {
    totalPurchases: orders.length,
    totalItems: itemCount,
    totalQuantity,
    totalAmount,
    avgPurchaseValue: orders.length > 0 ? totalAmount / orders.length : 0
  };
}

// Get report filters metadata (vendors, depots, variants for dropdowns)
exports.getReportFilters = async (req, res, next) => {
  try {
    const role = (req.user?.role || '').toUpperCase();
    const userVendorId = req.user?.vendorId;
    const [vendors, depots, products] = await Promise.all([
      // Get vendors (they are the farmers/suppliers)
      (async () => {
        if (role === 'VENDOR' && userVendorId) {
          const v = await prisma.vendor.findUnique({
            where: { id: userVendorId },
            select: { id: true, name: true, isDairySupplier: true }
          });
          return v ? [v] : [];
        }
        return prisma.vendor.findMany({
          select: { id: true, name: true, isDairySupplier: true },
          orderBy: { name: 'asc' }
        });
      })(),
      
      // Get depots
      prisma.depot.findMany({
        select: { id: true, name: true, city: true, address: true },
        orderBy: { name: 'asc' }
      }),
      
      // Get products with variants
      prisma.product.findMany({
        select: { 
          id: true, 
          name: true,
          variants: {
            select: { id: true, name: true }
          }
        },
        orderBy: { name: 'asc' }
      })
    ]);

    // Extract all variants from products
    const variants = [];
    products.forEach(product => {
      product.variants.forEach(variant => {
        variants.push({
          id: variant.id,
          name: `${product.name} - ${variant.name}`,
          productId: product.id,
          productName: product.name
        });
      });
    });

    res.json({
      success: true,
      data: {
        farmers: vendors, // Return vendors as farmers for the frontend; limited for VENDOR role
        depots,
        products: products.map(p => ({ id: p.id, name: p.name })),
        variants
      }
    });

  } catch (error) {
    console.error('[getReportFilters]', error);
    return next(createError(500, error.message || 'Failed to fetch report filters'));
  }
};

// Subscription Reports
exports.getSubscriptionReports = async (req, res, next) => {
  try {
    const {
      startDate,
      endDate,
      status, // 'expired', 'not_expired', 'all'
      paymentStatus,
      agencyId,
      productId,
      memberId,
      page = 1,
      limit = 50
    } = req.query;

    // Build where clause for subscriptions
    const where = {};
    
    // Date range filter (based on subscription start date or creation date)
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) {
        where.startDate.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.startDate.lte = end;
      }
    }

    // Expiry status filter
    const currentDate = new Date();
    if (status === 'expired') {
      where.expiryDate = {
        lt: currentDate
      };
    } else if (status === 'not_expired') {
      where.expiryDate = {
        gte: currentDate
      };
    }
    // 'all' or undefined shows all subscriptions

    // Other filters
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (agencyId) where.agencyId = parseInt(agencyId, 10);
    if (productId) where.productId = parseInt(productId, 10);
    if (memberId) where.memberId = parseInt(memberId, 10);

    // Calculate pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    // Fetch subscriptions with all related data
    const [subscriptions, totalCount] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          member: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                  email: true,
                  mobile: true
                }
              }
            }
          },
          product: {
            select: {
              id: true,
              name: true,
              categoryId: true
            }
          },
          agency: {
            select: {
              id: true,
              name: true,
              city: true
            }
          },
          deliveryAddress: {
            select: {
              id: true,
              recipientName: true,
              mobile: true,
              city: true,
              pincode: true,
              plotBuilding: true,
              streetArea: true,
              landmark: true,
              state: true
            }
          },
          depotProductVariant: {
            select: {
              id: true,
              name: true,
              mrp: true
            }
          }
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' }
        ],
        skip,
        take: limitNum
      }),
      prisma.subscription.count({ where })
    ]);

    // Transform data for response
    const transformedData = subscriptions.map(subscription => {
      const isExpired = subscription.expiryDate && new Date(subscription.expiryDate) < currentDate;
      
      return {
        id: subscription.id,
        memberId: subscription.memberId,
        memberName: subscription.member?.user?.name || 'N/A',
        memberEmail: subscription.member?.user?.email || 'N/A',
        memberMobile: subscription.member?.user?.mobile || 'N/A',
        productName: subscription.product?.name || 'N/A',
        variantName: subscription.depotProductVariant?.name || 'N/A',
        deliverySchedule: subscription.deliverySchedule,
        weekdays: subscription.weekdays,
        dailyQty: subscription.qty,
        alternateQty: subscription.altQty,
        totalQty: subscription.totalQty,
        rate: subscription.rate,
        amount: subscription.amount,
        walletamt: subscription.walletamt,
        payableamt: subscription.payableamt,
        receivedamt: subscription.receivedamt,
        paymentStatus: subscription.paymentStatus,
        paymentMode: subscription.paymentMode,
        paymentReferenceNo: subscription.paymentReferenceNo,
        paymentDate: subscription.paymentDate,
        startDate: subscription.startDate,
        expiryDate: subscription.expiryDate,
        isExpired: isExpired,
        // Agency assignment details
        agencyId: subscription.agencyId,
        agencyName: subscription.agency?.name || 'Unassigned',
        agencyCity: subscription.agency?.city || 'N/A',
        agencyAssigned: subscription.agencyId ? true : false,
        deliveryAddress: subscription.deliveryAddress ? {
          recipientName: subscription.deliveryAddress.recipientName,
          mobile: subscription.deliveryAddress.mobile,
          fullAddress: `${subscription.deliveryAddress.plotBuilding}, ${subscription.deliveryAddress.streetArea}${subscription.deliveryAddress.landmark ? ', ' + subscription.deliveryAddress.landmark : ''}, ${subscription.deliveryAddress.city}, ${subscription.deliveryAddress.state} - ${subscription.deliveryAddress.pincode}`
        } : null,
        deliveryInstructions: subscription.deliveryInstructions,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt
      };
    });

    // Calculate summary statistics
    const totalPages = Math.ceil(totalCount / limitNum);
    
    // Get overall statistics (not paginated)
    const stats = await prisma.subscription.groupBy({
      by: ['paymentStatus'],
      where,
      _count: {
        id: true
      },
      _sum: {
        amount: true,
        receivedamt: true,
        payableamt: true
      }
    });

    const summary = {
      totalSubscriptions: totalCount,
      currentPage: pageNum,
      totalPages,
      pageSize: limitNum,
      statistics: {
        byPaymentStatus: stats.reduce((acc, stat) => {
          acc[stat.paymentStatus] = {
            count: stat._count.id,
            totalAmount: stat._sum.amount || 0,
            totalReceived: stat._sum.receivedamt || 0,
            totalPayable: stat._sum.payableamt || 0
          };
          return acc;
        }, {}),
        expiredCount: transformedData.filter(s => s.isExpired).length,
        activeCount: transformedData.filter(s => !s.isExpired).length
      }
    };

    res.json({
      success: true,
      data: transformedData,
      summary,
      filters: {
        startDate,
        endDate,
        status,
        paymentStatus,
        agencyId,
        productId,
        memberId
      }
    });

  } catch (error) {
    console.error('[getSubscriptionReports]', error);
    return next(createError(500, error.message || 'Failed to generate subscription reports'));
  }
};
