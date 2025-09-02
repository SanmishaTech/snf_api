const asyncHandler = require("express-async-handler");
const createError = require("http-errors");
const { z } = require("zod");
const prisma = require("../../config/db");

// Validation schema for report filters
const deliveryReportSchema = z.object({
  deliveryDate: z.string().optional(),
  depotId: z.coerce.number().optional(),
  status: z.enum(['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'ALL']).optional(),
  productId: z.coerce.number().optional(),
});

const deliveryReportController = {
  // Get delivery date based SNF orders report with grouping
  getDeliveryDateOrdersReport: asyncHandler(async (req, res, next) => {
    try {
      const { user } = req;
      const userRole = user?.role?.toUpperCase();
      
      // Validate query parameters
      const filters = deliveryReportSchema.parse(req.query);
      const { deliveryDate, depotId, status, productId } = filters;

      // Build where clause for SNF orders
      const where = {};

      // Apply delivery date filter - exact match for specific date
      if (deliveryDate) {
        where.deliveryDate = new Date(deliveryDate);
      }

      // Apply status filter (payment status for SNF orders)
      if (status && status !== 'ALL') {
        where.paymentStatus = status;
      }

      // Apply depot filter
      if (depotId) {
        where.depotId = depotId;
      } else if (userRole === "DEPOT_ADMIN" || userRole === "DEPOTADMIN" || userRole?.includes("DEPOT")) {
        if (user.depotId) {
          where.depotId = user.depotId;
        }
      }

      // Apply product filter
      if (productId) {
        where.items = {
          some: {
            productId: productId
          }
        };
      }

      // Fetch SNF orders with related data
      const orders = await prisma.sNFOrder.findMany({
        where,
        include: {
          depot: {
            select: {
              id: true,
              name: true,
            }
          },
          member: {
            select: {
              id: true,
              name: true,
            }
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  category: {
                    select: {
                      id: true,
                      name: true,
                    }
                  }
                }
              },
              depotProductVariant: {
                select: {
                  id: true,
                  name: true,
                  mrp: true,
                  depot: {
                    select: {
                      id: true,
                      name: true,
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          deliveryDate: 'desc'
        }
      });

      // Group data by delivery date, then by products, then by depot variants
      const groupedData = {};

      orders.forEach(order => {
        const deliveryDateKey = order.deliveryDate ? order.deliveryDate.toISOString().split('T')[0] : 'No Delivery Date';
        
        if (!groupedData[deliveryDateKey]) {
          groupedData[deliveryDateKey] = {
            date: deliveryDateKey,
            totalOrders: 0,
            totalAmount: 0,
            products: {}
          };
        }

        groupedData[deliveryDateKey].totalOrders++;
        groupedData[deliveryDateKey].totalAmount += order.totalAmount || 0;

        order.items.forEach(item => {
          // Use product name from item if product relation is null
          const productId = item.product?.id || 0;
          const productName = item.product?.name || item.name;
          const categoryName = item.product?.category?.name || 'Uncategorized';
          
          const productKey = `${productId}-${productName}`;
          
          if (!groupedData[deliveryDateKey].products[productKey]) {
            groupedData[deliveryDateKey].products[productKey] = {
              productId: productId,
              productName: productName,
              categoryName: categoryName,
              totalQuantity: 0,
              totalAmount: 0,
              depotVariants: {}
            };
          }

          const depotVariantId = item.depotProductVariant?.id || 0;
          const depotVariantName = item.depotProductVariant?.name || item.variantName || 'No Variant';
          const depotName = item.depotProductVariant?.depot?.name || order.depot?.name || 'No Depot';
          const depotIdValue = item.depotProductVariant?.depot?.id || order.depot?.id || 0;
          
          const depotVariantKey = `${depotVariantId}-${depotVariantName}-${depotName}`;
          
          if (!groupedData[deliveryDateKey].products[productKey].depotVariants[depotVariantKey]) {
            groupedData[deliveryDateKey].products[productKey].depotVariants[depotVariantKey] = {
              depotVariantId: depotVariantId,
              depotVariantName: depotVariantName,
              depotId: depotIdValue,
              depotName: depotName,
              mrp: item.depotProductVariant?.mrp || 0,
              priceAtPurchase: item.price,
              orders: [],
              totalQuantity: 0,
              totalAmount: 0
            };
          }

          const variant = groupedData[deliveryDateKey].products[productKey].depotVariants[depotVariantKey];
          
          variant.orders.push({
            orderId: order.id,
            orderNo: order.orderNo,
            orderDate: order.createdAt,
            customerName: order.member?.name || order.name,
            customerMobile: order.mobile,
            paymentStatus: order.paymentStatus,
            quantity: item.quantity,
            price: item.price,
            lineAmount: item.lineTotal
          });

          variant.totalQuantity += item.quantity;
          variant.totalAmount += item.lineTotal;

          groupedData[deliveryDateKey].products[productKey].totalQuantity += item.quantity;
          groupedData[deliveryDateKey].products[productKey].totalAmount += item.lineTotal;
        });
      });

      // Convert to array format for easier frontend consumption
      const reportData = Object.values(groupedData).map(dateGroup => ({
        ...dateGroup,
        products: Object.values(dateGroup.products).map(product => ({
          ...product,
          depotVariants: Object.values(product.depotVariants)
        }))
      }));

      // Calculate summary statistics
      const summary = {
        totalDeliveryDates: reportData.length,
        totalOrders: reportData.reduce((sum, group) => sum + group.totalOrders, 0),
        totalAmount: reportData.reduce((sum, group) => sum + group.totalAmount, 0),
        uniqueProducts: new Set(
          reportData.flatMap(group => 
            group.products.map(product => product.productId)
          )
        ).size,
        uniqueDepotVariants: new Set(
          reportData.flatMap(group => 
            group.products.flatMap(product => 
              product.depotVariants.map(variant => variant.depotVariantId)
            )
          )
        ).size
      };

      res.json({
        success: true,
        data: reportData,
        summary,
        filters: {
          deliveryDate,
          depotId,
          status,
          productId
        }
      });

    } catch (error) {
      console.error('Error generating SNF delivery report:', error);
      next(error);
    }
  }),

  // Get available filters data for dropdowns
  getReportFilters: asyncHandler(async (req, res, next) => {
    try {
      const { user } = req;
      const userRole = user?.role?.toUpperCase();

      // Base where clause for user role filtering
      let depotFilter = {};
      if (userRole === "DEPOT_ADMIN" || userRole === "DEPOTADMIN" || userRole?.includes("DEPOT")) {
        if (user.depotId) {
          depotFilter = { id: user.depotId };
        }
      }

      // Get available depots from SNF orders
      const depots = await prisma.depot.findMany({
        where: depotFilter,
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' }
      });

      // Get available products from SNF order items
      const uniqueProducts = await prisma.sNFOrderItem.findMany({
        select: {
          product: {
            select: {
              id: true,
              name: true,
              category: {
                select: {
                  id: true,
                  name: true,
                }
              }
            }
          },
          name: true // fallback product name
        },
        distinct: ['productId', 'name']
      });

      // Process unique products, handling both linked products and standalone items
      const products = [];
      const seenProducts = new Set();
      
      uniqueProducts.forEach(item => {
        if (item.product && item.product.id) {
          if (!seenProducts.has(item.product.id)) {
            products.push(item.product);
            seenProducts.add(item.product.id);
          }
        } else if (item.name && !seenProducts.has(item.name)) {
          products.push({
            id: 0, // Use 0 for products without a linked Product record
            name: item.name,
            category: null
          });
          seenProducts.add(item.name);
        }
      });

      // Sort products by name
      products.sort((a, b) => a.name.localeCompare(b.name));

      // Get date range from existing SNF orders
      const dateRange = await prisma.sNFOrder.aggregate({
        _min: {
          deliveryDate: true,
        },
        _max: {
          deliveryDate: true,
        },
      });

      // Get available delivery dates for dropdown
      const availableDates = await prisma.sNFOrder.findMany({
        select: {
          deliveryDate: true
        },
        where: {
          deliveryDate: {
            not: null
          }
        },
        distinct: ['deliveryDate'],
        orderBy: {
          deliveryDate: 'desc'
        }
      });

      res.json({
        success: true,
        filters: {
          depots,
          products,
          availableDates: availableDates.map(order => ({
            value: order.deliveryDate.toISOString().split('T')[0],
            label: order.deliveryDate.toLocaleDateString('en-IN', {
              weekday: 'short',
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })
          })),
          dateRange: {
            minDate: dateRange._min.deliveryDate,
            maxDate: dateRange._max.deliveryDate,
          },
          statusOptions: [
            { value: 'ALL', label: 'All Payment Status' },
            { value: 'PENDING', label: 'Payment Pending' },
            { value: 'PAID', label: 'Payment Completed' },
            { value: 'FAILED', label: 'Payment Failed' },
            { value: 'CANCELLED', label: 'Cancelled' }
          ]
        }
      });

    } catch (error) {
      console.error('Error fetching SNF report filters:', error);
      next(error);
    }
  })
};

module.exports = deliveryReportController;
