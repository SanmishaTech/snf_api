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

exports.getWalletReport = async (req, res, next) => {
  try {
    const { endDate } = req.query;

    const asOf = endDate ? new Date(endDate) : new Date();
    if (Number.isNaN(asOf.getTime())) {
      return next(createError(400, 'Invalid endDate'));
    }
    asOf.setHours(23, 59, 59, 999);

    const txGroups = await prisma.walletTransaction.groupBy({
      by: ['memberId', 'type'],
      where: {
        status: 'PAID',
        createdAt: {
          lte: asOf
        }
      },
      _sum: {
        amount: true
      }
    });

    const sums = new Map();
    txGroups.forEach(g => {
      const memberId = g.memberId;
      const prev = sums.get(memberId) || { credit: 0, debit: 0 };
      const amt = Number(g._sum?.amount || 0);
      if (String(g.type || '').toUpperCase() === 'DEBIT') {
        prev.debit += amt;
      } else {
        prev.credit += amt;
      }
      sums.set(memberId, prev);
    });

    const members = await prisma.member.findMany({
      include: {
        user: { select: { name: true, mobile: true } },
        addresses: {
          take: 1,
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: {
            plotBuilding: true,
            streetArea: true,
            landmark: true,
            city: true,
            state: true,
            pincode: true
          }
        }
      },
      orderBy: [{ id: 'desc' }]
    });

    const formatAddress = (addr) => {
      if (!addr) return '';
      return `${addr.plotBuilding || ''}${addr.streetArea ? ', ' + addr.streetArea : ''}${addr.landmark ? ', ' + addr.landmark : ''}${addr.city ? ', ' + addr.city : ''}${addr.state ? ', ' + addr.state : ''}`
        .replace(/^,\s*/g, '')
        .trim();
    };

    const report = members.map(m => {
      const s = sums.get(m.id) || { credit: 0, debit: 0 };
      const closingBalance = Number(s.credit || 0) - Number(s.debit || 0);
      const addr = Array.isArray(m.addresses) && m.addresses.length > 0 ? m.addresses[0] : null;
      return {
        name: m.name || m.user?.name || '',
        memberId: m.id,
        mobile: m.user?.mobile || '',
        address: formatAddress(addr),
        pincode: addr?.pincode || '',
        closingBalance
      };
    });

    report.sort((a, b) => (b.closingBalance || 0) - (a.closingBalance || 0));
    const totalClosingBalance = report.reduce((sum, r) => sum + (Number(r.closingBalance) || 0), 0);

    return res.json({
      success: true,
      data: {
        report,
        totals: {
          totalClosingBalance
        },
        filters: {
          endDate: endDate || null
        },
        recordCount: report.length
      }
    });
  } catch (error) {
    console.error('[getWalletReport]', error);
    return next(createError(500, error.message || 'Failed to generate wallet report'));
  }
};

exports.getExceptionReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate) {
      dateRange.gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateRange.lte = end;
    }

    const formatAddress = (addr) => {
      if (!addr) return '';
      return `${addr.plotBuilding || ''}${addr.streetArea ? ', ' + addr.streetArea : ''}${addr.landmark ? ', ' + addr.landmark : ''}${addr.city ? ', ' + addr.city : ''}${addr.state ? ', ' + addr.state : ''}`
        .replace(/^,\s*/g, '')
        .trim();
    };

    const deliveryWhere = {};
    if (startDate || endDate) {
      deliveryWhere.deliveryDate = dateRange;
    }

    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where: deliveryWhere,
      include: {
        Depot: { select: { id: true, name: true } },
        DepotProductVariant: { select: { id: true, name: true } },
        subscription: {
          include: {
            depotProductVariant: { select: { id: true, name: true } },
            deliveryAddress: {
              select: {
                plotBuilding: true,
                streetArea: true,
                landmark: true,
                city: true,
                state: true,
                pincode: true
              }
            },
            member: {
              include: {
                user: { select: { name: true, mobile: true } }
              }
            }
          }
        }
      },
      orderBy: [{ deliveryDate: 'desc' }, { id: 'desc' }]
    });

    const variantChanges = [];
    deliveries.forEach(d => {
      const lastVariantId = d.DepotProductVariant?.id || d.depotProductVariantId || null;
      const newVariantId = d.subscription?.depotProductVariant?.id || d.subscription?.depotProductVariantId || null;
      if (!lastVariantId || !newVariantId) return;
      if (String(lastVariantId) === String(newVariantId)) return;

      const addr = d.subscription?.deliveryAddress;

      variantChanges.push({
        exceptionType: 'VARIANT_CHANGED',
        date: d.deliveryDate,
        customerId: d.subscription?.memberId || d.memberId || '',
        customerName: d.subscription?.member?.name || d.subscription?.member?.user?.name || '',
        address: formatAddress(addr),
        pincode: addr?.pincode || '',
        depotName: d.Depot?.name || '',
        subFromDate: d.subscription?.startDate || '',
        subToDate: d.subscription?.expiryDate || '',
        mobileNumber: d.subscription?.member?.user?.mobile || '',
        lastVariant: d.DepotProductVariant?.name || '',
        newVariant: d.subscription?.depotProductVariant?.name || ''
      });
    });

    const cancelledWhere = {
      paymentStatus: 'CANCELLED'
    };
    if (startDate || endDate) {
      cancelledWhere.updatedAt = dateRange;
    }

    const cancelledSubscriptions = await prisma.subscription.findMany({
      where: cancelledWhere,
      include: {
        depotProductVariant: { select: { id: true, name: true, depot: { select: { name: true } } } },
        deliveryAddress: {
          select: {
            plotBuilding: true,
            streetArea: true,
            landmark: true,
            city: true,
            state: true,
            pincode: true
          }
        },
        member: {
          include: {
            user: { select: { name: true, mobile: true } }
          }
        }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }]
    });

    const expiredWhere = {
      paymentStatus: { not: 'CANCELLED' }
    };
    if (startDate || endDate) {
      expiredWhere.expiryDate = dateRange;
    }

    const expiredSubscriptions = await prisma.subscription.findMany({
      where: expiredWhere,
      include: {
        depotProductVariant: { select: { id: true, name: true, depot: { select: { name: true } } } },
        deliveryAddress: {
          select: {
            plotBuilding: true,
            streetArea: true,
            landmark: true,
            city: true,
            state: true,
            pincode: true
          }
        },
        member: {
          include: {
            user: { select: { name: true, mobile: true } }
          }
        }
      },
      orderBy: [{ expiryDate: 'desc' }, { id: 'desc' }]
    });

    const stoppedSubscriptions = [...cancelledSubscriptions.map(s => {
      const addr = s.deliveryAddress;
      const variantName = s.depotProductVariant?.name || '';
      return {
        exceptionType: 'STOPPED_SUBSCRIPTION',
        date: s.updatedAt,
        customerId: s.memberId,
        customerName: s.member?.name || s.member?.user?.name || '',
        address: formatAddress(addr),
        pincode: addr?.pincode || '',
        depotName: s.depotProductVariant?.depot?.name || '',
        subFromDate: s.startDate || '',
        subToDate: s.expiryDate || '',
        mobileNumber: s.member?.user?.mobile || '',
        lastVariant: variantName,
        newVariant: variantName
      };
    }),
    ...expiredSubscriptions.map(s => {
      const addr = s.deliveryAddress;
      const variantName = s.depotProductVariant?.name || '';
      return {
        exceptionType: 'STOPPED_SUBSCRIPTION',
        date: s.expiryDate,
        customerId: s.memberId,
        customerName: s.member?.name || s.member?.user?.name || '',
        address: formatAddress(addr),
        pincode: addr?.pincode || '',
        depotName: s.depotProductVariant?.depot?.name || '',
        subFromDate: s.startDate || '',
        subToDate: s.expiryDate || '',
        mobileNumber: s.member?.user?.mobile || '',
        lastVariant: variantName,
        newVariant: variantName
      };
    })];

    const startDateWhere = {};
    if (startDate || endDate) {
      startDateWhere.startDate = dateRange;
    }

    const startedSubscriptions = await prisma.subscription.findMany({
      where: startDateWhere,
      include: {
        depotProductVariant: { select: { id: true, name: true, depot: { select: { name: true } } } },
        deliveryAddress: {
          select: {
            plotBuilding: true,
            streetArea: true,
            landmark: true,
            city: true,
            state: true,
            pincode: true
          }
        },
        member: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            user: { select: { name: true, mobile: true } }
          }
        }
      },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }]
    });

    const isSameCalendarDate = (a, b) => {
      if (!a || !b) return false;
      const da = new Date(a);
      const db = new Date(b);
      if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
      return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
    };

    const newCustomers = startedSubscriptions
      .filter(s => {
        if (!s.member?.createdAt) return false;
        if (!(startDate || endDate)) return isSameCalendarDate(s.member.createdAt, s.startDate);
        const created = new Date(s.member.createdAt);
        const inRange = (!dateRange.gte || created >= dateRange.gte) && (!dateRange.lte || created <= dateRange.lte);
        return inRange && isSameCalendarDate(s.member.createdAt, s.startDate);
      })
      .map(s => {
        const addr = s.deliveryAddress;
        const variantName = s.depotProductVariant?.name || '';
        return {
          exceptionType: 'NEW_CUSTOMER',
          date: s.startDate,
          customerId: s.memberId,
          customerName: s.member?.name || s.member?.user?.name || '',
          address: formatAddress(addr),
          pincode: addr?.pincode || '',
          depotName: s.depotProductVariant?.depot?.name || '',
          subFromDate: s.startDate || '',
          subToDate: s.expiryDate || '',
          mobileNumber: s.member?.user?.mobile || '',
          lastVariant: variantName,
          newVariant: variantName
        };
      });

    const report = [...stoppedSubscriptions, ...newCustomers, ...variantChanges].sort((a, b) => {
      const da = new Date(a.date);
      const db = new Date(b.date);
      return (Number.isNaN(db.getTime()) ? 0 : db.getTime()) - (Number.isNaN(da.getTime()) ? 0 : da.getTime());
    });

    const counts = {
      stoppedSubscriptions: stoppedSubscriptions.length,
      newCustomers: newCustomers.length,
      variantChanges: variantChanges.length
    };

    return res.json({
      success: true,
      data: {
        report,
        counts,
        filters: { startDate, endDate },
        recordCount: report.length
      }
    });
  } catch (error) {
    console.error('[getExceptionReport]', error);
    return next(createError(500, error.message || 'Failed to generate exception report'));
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
          select: { id: true, name: true, city: true, user: { select: { active: true } } }
        });
        agencies = agency && agency.user?.active !== false ? [agency] : [];
      } else {
        agencies = await prisma.agency.findMany({
          where: {
            user: {
              active: true
            }
          },
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
    const { startDate, endDate, agencyId, areaId, status, groupBy = 'agency,area,variant,status' } = req.query;

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
            agency: { select: { id: true, name: true, city: true, user: { select: { active: true } } } },
            product: { select: { id: true, name: true } },
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
        Depot: { select: { id: true, name: true } },
        DepotProductVariant: { select: { id: true, name: true, mrp: true, purchasePrice: true } },
        product: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true, city: true, user: { select: { active: true } } } }
      },
      orderBy: [{ deliveryDate: 'desc' }, { id: 'desc' }]
    });

    // Transform to flat structure expected by frontend exporter
    const flat = [];
    deliveries.forEach(d => {
      const resolvedAgency = d.agent || d.subscription?.agency;
      // Do not show inactive agencies in report
      if (resolvedAgency && resolvedAgency?.user?.active === false) {
        return;
      }

      // If no agency is assigned, keep it as an "Unassigned" bucket
      const effectiveAgencyId = resolvedAgency?.id ?? 'unassigned';
      const effectiveAgencyName = resolvedAgency?.name ?? 'Unassigned';
      const effectiveAgencyCity = resolvedAgency?.city ?? '';

      // Calculate amount based on subscription rate and quantity
      const rate = parseFloat(d.subscription?.rate) || 0;
      const quantity = parseInt(d.quantity) || 1;
      const amount = quantity * rate;
      
      // Determine area information - if delivery address exists, check its location
      // If no delivery address or location is present, show Any
      let areaName, areaIdValue, city;

      const effectiveAddress = d.deliveryAddress || d.subscription?.deliveryAddress;

      if (effectiveAddress && effectiveAddress.locationId) {
        // Delivery address exists with a location, use it
        areaName = effectiveAddress.location?.name || 'Any';
        areaIdValue = effectiveAddress.locationId;
        city = effectiveAddress.location?.city?.name || effectiveAddress.city || 'Any';
      } else {
        // No delivery address or no location assigned to delivery address, use Any
        areaName = 'Any';
        areaIdValue = 'any';
        city = effectiveAddress?.city || d.agent?.city || 'Any';
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
        pincode: effectiveAddress?.pincode || '',
        deliveryAddress: effectiveAddress ? 
          `${effectiveAddress.plotBuilding}, ${effectiveAddress.streetArea}, ${effectiveAddress.city}` : 
          'No address specified',
        areaId: areaIdValue,
        areaName: areaName,
        city: city || effectiveAgencyCity,
        agencyId: effectiveAgencyId,
        agencyName: effectiveAgencyName,
        deliveredBy: effectiveAgencyName,
        deliveryTime: '', // Not available in current schema
        depotId: d.Depot?.id || d.depotId || null,
        depotName: d.Depot?.name || '',
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
      totalQuantity: flat.reduce((s, x) => s + (parseInt(x.quantity) || 0), 0),
      totalAmount: flat.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0),
      deliveredCount: flat.filter(x => (x.status || '').toLowerCase() === 'delivered').length,
      pendingCount: flat.filter(x => (x.status || '').toLowerCase() === 'pending').length
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

    // Fetch delivery schedule entries with agency, status, and variant information
    const deliveries = await prisma.deliveryScheduleEntry.findMany({
      where,
      include: {
        DepotProductVariant: { select: { id: true, name: true } },
        subscription: {
          include: {
            agency: { select: { id: true, name: true, city: true, user: { select: { active: true } } } },
            depotProductVariant: { select: { id: true, name: true } }
          }
        },
        agent: { select: { id: true, name: true, city: true, user: { select: { active: true } } } }
      },
      orderBy: [{ deliveryDate: 'desc' }]
    });

    // Group by agency + variant and count status-wise
    const agencySummary = new Map();
    const statusSet = new Set();

    deliveries.forEach(d => {
      const resolvedAgency = d.agent || d.subscription?.agency;
      // Skip inactive agencies
      if (resolvedAgency && resolvedAgency?.user?.active === false) {
        return;
      }

      // If no agency is assigned, group it under an "Unassigned" bucket
      const effectiveAgencyId = resolvedAgency?.id ?? 'unassigned';
      const effectiveAgencyName = resolvedAgency?.name ?? 'Unassigned';
      const effectiveAgencyCity = resolvedAgency?.city ?? '';

      const agencyId = effectiveAgencyId;
      const agencyName = effectiveAgencyName;
      const agencyCity = effectiveAgencyCity;

      const resolvedVariant = d.DepotProductVariant || d.subscription?.depotProductVariant;
      const variantId = resolvedVariant?.id ?? 'unknown_variant';
      const variantName = resolvedVariant?.name ?? 'Unknown Variant';

      const status = d.status || 'UNKNOWN';
      
      statusSet.add(status);

      const groupKey = `${agencyId}__${variantId}`;

      if (!agencySummary.has(groupKey)) {
        agencySummary.set(groupKey, {
          id: groupKey,
          agencyId,
          name: agencyName,
          city: agencyCity,
          variantId,
          variantName,
          statusCounts: {},
          totalCount: 0
        });
      }

      const agency = agencySummary.get(groupKey);
      agency.statusCounts[status] = (agency.statusCounts[status] || 0) + 1;
      agency.totalCount += 1;
    });

    // Convert to array format
    const summaryData = Array.from(agencySummary.values());
    summaryData.sort((a, b) => {
      const nameCmp = String(a.name || '').localeCompare(String(b.name || ''));
      if (nameCmp !== 0) return nameCmp;
      return String(a.variantName || '').localeCompare(String(b.variantName || ''));
    });
    const statusList = Array.from(statusSet).sort();

    // Calculate totals
    const uniqueAgencyCount = new Set(summaryData.map(x => String(x.agencyId ?? x.id))).size;
    const totals = {
      totalDeliveries: deliveries.length,
      totalAgencies: uniqueAgencyCount,
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
    let key;
    if (level === 'agency') {
      key = row.agencyId;
    } else if (level === 'area') {
      key = row.areaId;
    } else if (level === 'variant') {
      // Use composite key for variants to ensure proper separation by product
      key = `${row.productId}_${row.variantId}`;
    } else {
      key = row.status || 'unknown';
    }
    
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const result = [];
  Object.entries(groups).forEach(([id, rows]) => {
    let nodeName, productName, variantName;
    
    if (level === 'agency') {
      nodeName = rows[0].agencyName;
    } else if (level === 'area') {
      nodeName = rows[0].areaName;
    } else if (level === 'variant') {
      productName = rows[0].productName;
      variantName = rows[0].variantName;
      nodeName = `${productName} - ${variantName}`;
    } else {
      nodeName = rows[0].status;
    }
    
    const node = {
      level,
      id,
      name: nodeName,
      productName: level === 'variant' ? productName : undefined,
      variantName: level === 'variant' ? variantName : undefined,
      city: level === 'area' ? rows[0].city : undefined,
      data: [],
      totals: {
        totalQuantity: rows.reduce((s, r) => s + (parseInt(r.quantity) || 0), 0),
        totalAmount: rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
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
                  mobile: true,
                  active: true
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
          productOrder: {
            select: {
              id: true,
              orderNo: true,
              createdAt: true
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
        orderId: subscription.productOrder?.orderNo || null,
        orderDate: subscription.productOrder?.createdAt || null,
        memberId: subscription.memberId,
        memberName: subscription.member?.user?.name || 'N/A',
        memberEmail: subscription.member?.user?.email || 'N/A',
        memberMobile: subscription.member?.user?.mobile || 'N/A',
        memberActive: subscription.member?.user?.active ?? true,
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

// Sale Register Report (Revenue Report rename)
exports.getSaleRegisterReport = async (req, res, next) => {
  try {
    if (!req.query.paymentStatus) {
      req.query.paymentStatus = 'PAID';
    }
    return exports.getSubscriptionReports(req, res, next);
  } catch (error) {
    console.error('[getSaleRegisterReport]', error);
    return next(createError(500, error.message || 'Failed to generate sale register report'));
  }
};

exports.getRevenueReport = async (req, res, next) => {
  try {
    const paidTotals = await prisma.subscription.groupBy({
      by: ['memberId'],
      where: {
        paymentStatus: 'PAID',
        product: {
          isDairyProduct: true
        }
      },
      _sum: {
        receivedamt: true
      }
    });

    const memberIds = paidTotals.map(x => x.memberId);
    if (memberIds.length === 0) {
      return res.json({
        success: true,
        data: {
          report: [],
          recordCount: 0
        }
      });
    }

    const members = await prisma.member.findMany({
      where: { id: { in: memberIds } },
      include: {
        user: { select: { name: true, mobile: true } },
        addresses: {
          take: 1,
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: {
            plotBuilding: true,
            streetArea: true,
            landmark: true,
            city: true,
            state: true,
            pincode: true
          }
        }
      }
    });

    const memberMap = new Map(members.map(m => [m.id, m]));

    const firstMilkSubs = await prisma.subscription.groupBy({
      by: ['memberId'],
      where: {
        memberId: { in: memberIds },
        product: {
          isDairyProduct: true
        }
      },
      _min: {
        startDate: true
      }
    });

    const firstStartMap = new Map(firstMilkSubs.map(x => [x.memberId, x._min?.startDate || null]));

    const now = new Date();

    const milkSubsOrdered = await prisma.subscription.findMany({
      where: {
        memberId: { in: memberIds },
        product: {
          isDairyProduct: true
        }
      },
      orderBy: [{ memberId: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        memberId: true,
        startDate: true,
        expiryDate: true,
        paymentStatus: true,
        depotProductVariant: {
          select: {
            name: true,
            depot: { select: { name: true } }
          }
        },
        deliveryAddress: {
          select: {
            plotBuilding: true,
            streetArea: true,
            landmark: true,
            city: true,
            state: true,
            pincode: true
          }
        }
      }
    });

    const currentSubMap = new Map();
    const fallbackSubMap = new Map();
    for (const s of milkSubsOrdered) {
      if (!fallbackSubMap.has(s.memberId)) {
        fallbackSubMap.set(s.memberId, s);
      }

      const isCancelled = String(s.paymentStatus || '').toUpperCase() === 'CANCELLED';
      const isActive = !isCancelled && s.expiryDate && new Date(s.expiryDate) >= now;
      if (isActive && !currentSubMap.has(s.memberId)) {
        currentSubMap.set(s.memberId, s);
      }
    }

    const formatAddress = (addr) => {
      if (!addr) return '';
      return `${addr.plotBuilding || ''}${addr.streetArea ? ', ' + addr.streetArea : ''}${addr.landmark ? ', ' + addr.landmark : ''}${addr.city ? ', ' + addr.city : ''}${addr.state ? ', ' + addr.state : ''}`
        .replace(/^,\s*/g, '')
        .trim();
    };

    const report = paidTotals
      .map(t => {
        const member = memberMap.get(t.memberId);
        const latest = currentSubMap.get(t.memberId) || fallbackSubMap.get(t.memberId);
        const memberAddr = Array.isArray(member?.addresses) && member.addresses.length > 0 ? member.addresses[0] : null;
        const addr = latest?.deliveryAddress || memberAddr;
        const name = member?.name || member?.user?.name || '';

        return {
          name,
          memberId: t.memberId,
          saleAmount: Number(t._sum?.receivedamt || 0),
          mobile: member?.user?.mobile || '',
          currentVariant: latest?.depotProductVariant?.name || '',
          milkSubscriptionStartDate: firstStartMap.get(t.memberId) || null,
          address: formatAddress(addr),
          pincode: addr?.pincode || '',
          depot: latest?.depotProductVariant?.depot?.name || ''
        };
      })
      .sort((a, b) => (b.saleAmount || 0) - (a.saleAmount || 0));

    return res.json({
      success: true,
      data: {
        report,
        recordCount: report.length
      }
    });
  } catch (error) {
    console.error('[getRevenueReport]', error);
    return next(createError(500, error.message || 'Failed to generate revenue report'));
  }
};
