const asyncHandler = require("express-async-handler");
const { z } = require("zod");
const prisma = require("../../config/db");

// Validation schema for labeling filters
const labelingFiltersSchema = z.object({
  deliveryDate: z.string(),
  depotId: z.coerce.number().optional(),
});

const deliveryLabelingController = {
  // Get delivery labeling report
  getDeliveryLabelingReport: asyncHandler(async (req, res, next) => {
    try {
      const { user } = req;
      const userRole = user?.role?.toUpperCase();
      
      // Validate query parameters
      const filters = labelingFiltersSchema.parse(req.query);
      const { deliveryDate, depotId } = filters;

      // Build where clause for SNF orders
      const where = {
        deliveryDate: new Date(deliveryDate),
      };

      // Apply depot filter
      if (depotId) {
        where.depotId = depotId;
      } else if (userRole === "DEPOT_ADMIN" || userRole === "DEPOTADMIN" || userRole?.includes("DEPOT")) {
        if (user.depotId) {
          where.depotId = user.depotId;
        }
      }

      // Fetch SNF orders with related data for labeling
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
                }
              }
            }
          }
        },
        orderBy: [
          { createdAt: 'asc' }, // Order by creation time for consistent labeling
          { id: 'asc' }
        ]
      });

      // Transform orders for labeling format
      const labelingOrders = orders.map(order => ({
        id: order.id,
        orderNo: order.orderNo,
        name: order.member?.name || order.name,
        mobile: order.mobile,
        email: order.email,
        addressLine1: order.addressLine1,
        addressLine2: order.addressLine2,
        city: order.city,
        state: order.state,
        pincode: order.pincode,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        paymentMode: order.paymentMode,
        deliveryDate: order.deliveryDate,
        createdAt: order.createdAt,
        depot: order.depot,
        items: order.items.map(item => ({
          id: item.id,
          name: item.name,
          variantName: item.variantName,
          quantity: item.quantity,
          price: item.price,
          lineTotal: item.lineTotal,
          product: item.product,
          depotProductVariant: item.depotProductVariant,
        }))
      }));

      // Calculate summary
      const totalOrders = labelingOrders.length;
      const totalAmount = labelingOrders.reduce((sum, order) => sum + order.totalAmount, 0);
      const paidOrders = labelingOrders.filter(order => order.paymentStatus === 'PAID').length;
      const pendingOrders = totalOrders - paidOrders;
      const paidAmount = labelingOrders
        .filter(order => order.paymentStatus === 'PAID')
        .reduce((sum, order) => sum + order.totalAmount, 0);
      const pendingAmount = totalAmount - paidAmount;

      const summary = {
        totalOrders,
        totalAmount,
        paidOrders,
        pendingOrders,
        paidAmount,
        pendingAmount,
      };

      res.json({
        success: true,
        orders: labelingOrders,
        summary,
        filters: {
          deliveryDate,
          depotId
        }
      });

    } catch (error) {
      console.error('Error generating delivery labeling report:', error);
      next(error);
    }
  }),
};

module.exports = deliveryLabelingController;
