const asyncHandler = require("express-async-handler");
const createError = require("http-errors");
const { z } = require("zod");
const prisma = require("../../config/db");

// Validation schema for unit conversion request
const unitConversionSchema = z.object({
  sourceVariantId: z.coerce.number().int().positive(),
  targetVariantId: z.coerce.number().int().positive(),
  sourceQuantity: z.coerce.number().positive(),
  targetQuantity: z.coerce.number().positive(),
  depotId: z.coerce.number().int().positive(),
  notes: z.string().optional()
});

// Validation schema for bulk conversion
const bulkConversionSchema = z.object({
  depotId: z.coerce.number().int().positive(),
  notes: z.string().optional(),
  conversions: z.array(z.object({
    sourceVariantId: z.coerce.number().int().positive(),
    targetVariantId: z.coerce.number().int().positive(),
    sourceQuantity: z.coerce.number().positive(),
    targetQuantity: z.coerce.number().positive()
  })).min(1)
});

module.exports = {
  // Get depot variants for conversion
  getDepotVariantsForConversion: asyncHandler(async (req, res, next) => {
    const depotId = parseInt(req.params.depotId, 10);
    if (isNaN(depotId)) {
      return next(createError(400, "Invalid depotId parameter"));
    }

    try {
      const variants = await prisma.depotProductVariant.findMany({
        where: { 
          depotId,
          isHidden: false 
        },
        include: {
          product: { select: { id: true, name: true } },
          depot: { select: { id: true, name: true } }
        },
        orderBy: [
          { product: { name: 'asc' } },
          { name: 'asc' }
        ]
      });

      res.json(variants);
    } catch (error) {
      next(error);
    }
  }),

  // Get product variants in depot
  getProductVariantsInDepot: asyncHandler(async (req, res, next) => {
    const depotId = parseInt(req.params.depotId, 10);
    const productId = parseInt(req.params.productId, 10);
    
    if (isNaN(depotId) || isNaN(productId)) {
      return next(createError(400, "Invalid depotId or productId parameter"));
    }

    try {
      const variants = await prisma.depotProductVariant.findMany({
        where: { 
          depotId,
          productId,
          isHidden: false 
        },
        include: {
          product: { select: { id: true, name: true } },
          depot: { select: { id: true, name: true } }
        },
        orderBy: { name: 'asc' }
      });

      res.json(variants);
    } catch (error) {
      next(error);
    }
  }),

  // Validate conversion
  validateConversion: asyncHandler(async (req, res, next) => {
    try {
      const data = unitConversionSchema.parse(req.body);
      const errors = [];
      const warnings = [];

      // Check if source and target variants are different
      if (data.sourceVariantId === data.targetVariantId) {
        errors.push("Source and target variants must be different");
      }

      // Check if both variants exist and belong to the same depot
      const [sourceVariant, targetVariant] = await Promise.all([
        prisma.depotProductVariant.findUnique({
          where: { id: data.sourceVariantId },
          include: { product: true }
        }),
        prisma.depotProductVariant.findUnique({
          where: { id: data.targetVariantId },
          include: { product: true }
        })
      ]);

      if (!sourceVariant) {
        errors.push("Source variant not found");
      }
      if (!targetVariant) {
        errors.push("Target variant not found");
      }

      if (sourceVariant && targetVariant) {
        // Check if both variants belong to the specified depot
        if (sourceVariant.depotId !== data.depotId) {
          errors.push("Source variant does not belong to the specified depot");
        }
        if (targetVariant.depotId !== data.depotId) {
          errors.push("Target variant does not belong to the specified depot");
        }

        // Check if source has enough stock
        if (sourceVariant.closingQty < data.sourceQuantity) {
          errors.push(`Insufficient stock. Available: ${sourceVariant.closingQty}, Required: ${data.sourceQuantity}`);
        }

        // Check if quantities are positive
        if (data.sourceQuantity <= 0) {
          errors.push("Source quantity must be greater than 0");
        }
        if (data.targetQuantity <= 0) {
          errors.push("Target quantity must be greater than 0");
        }

        // Add warnings for unusual conversions
        if (sourceVariant.productId !== targetVariant.productId) {
          warnings.push("Converting between different products - please verify this is intended");
        }

        const conversionRatio = data.targetQuantity / data.sourceQuantity;
        if (conversionRatio > 100 || conversionRatio < 0.01) {
          warnings.push("Unusual conversion ratio detected - please double-check quantities");
        }
      }

      res.json({
        isValid: errors.length === 0,
        errors,
        warnings
      });
    } catch (error) {
      next(error);
    }
  }),

  // Perform unit conversion
  performConversion: asyncHandler(async (req, res, next) => {
    try {
      const data = unitConversionSchema.parse(req.body);
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';

      // Perform inline validation
      const errors = [];
      
      // Check if source and target variants are different
      if (data.sourceVariantId === data.targetVariantId) {
        errors.push("Source and target variants must be different");
      }

      // Check if both variants exist and belong to the same depot
      const [sourceVariant, targetVariant] = await Promise.all([
        prisma.depotProductVariant.findUnique({
          where: { id: data.sourceVariantId },
          include: { product: true }
        }),
        prisma.depotProductVariant.findUnique({
          where: { id: data.targetVariantId },
          include: { product: true }
        })
      ]);

      if (!sourceVariant) {
        errors.push("Source variant not found");
      }
      if (!targetVariant) {
        errors.push("Target variant not found");
      }

      if (sourceVariant && targetVariant) {
        // Check if both variants belong to the specified depot
        if (sourceVariant.depotId !== data.depotId) {
          errors.push("Source variant does not belong to the specified depot");
        }
        if (targetVariant.depotId !== data.depotId) {
          errors.push("Target variant does not belong to the specified depot");
        }

        // Check if source has enough stock
        if (sourceVariant.closingQty < data.sourceQuantity) {
          errors.push(`Insufficient stock. Available: ${sourceVariant.closingQty}, Required: ${data.sourceQuantity}`);
        }
      }

      if (errors.length > 0) {
        return next(createError(400, errors.join('; ')));
      }

      // Perform the conversion in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Get current stock levels
        const [sourceVariant, targetVariant] = await Promise.all([
          tx.depotProductVariant.findUnique({
            where: { id: data.sourceVariantId }
          }),
          tx.depotProductVariant.findUnique({
            where: { id: data.targetVariantId }
          })
        ]);

        if (!sourceVariant || !targetVariant) {
          throw new Error("One or both variants not found");
        }

        // Check stock availability again within transaction
        if (sourceVariant.closingQty < data.sourceQuantity) {
          throw new Error(`Insufficient stock. Available: ${sourceVariant.closingQty}, Required: ${data.sourceQuantity}`);
        }

        // Update source variant (decrease stock)
        const updatedSource = await tx.depotProductVariant.update({
          where: { id: data.sourceVariantId },
          data: {
            closingQty: sourceVariant.closingQty - data.sourceQuantity
          }
        });

        // Update target variant (increase stock)
        const updatedTarget = await tx.depotProductVariant.update({
          where: { id: data.targetVariantId },
          data: {
            closingQty: targetVariant.closingQty + data.targetQuantity
          }
        });

        // Create conversion history record
        const conversionRecord = await tx.unitConversionHistory.create({
          data: {
            depotId: data.depotId,
            sourceVariantId: data.sourceVariantId,
            targetVariantId: data.targetVariantId,
            sourceQuantity: data.sourceQuantity,
            targetQuantity: data.targetQuantity,
            sourceVariantName: sourceVariant.name,
            targetVariantName: targetVariant.name,
            performedBy: userName,
            performedById: userId,
            notes: data.notes,
            performedAt: new Date()
          }
        });

        // Create stock ledger entries
        const transactionDate = new Date();
        
        // Source variant - outward movement (issuedQty)
        await tx.stockLedger.create({
          data: {
            productId: sourceVariant.productId,
            variantId: data.sourceVariantId,
            depotId: data.depotId,
            transactionDate,
            receivedQty: 0,
            issuedQty: data.sourceQuantity,
            module: 'UNIT_CONVERSION',
            foreignKey: conversionRecord.id
          }
        });

        // Target variant - inward movement (receivedQty)
        await tx.stockLedger.create({
          data: {
            productId: targetVariant.productId,
            variantId: data.targetVariantId,
            depotId: data.depotId,
            transactionDate,
            receivedQty: data.targetQuantity,
            issuedQty: 0,
            module: 'UNIT_CONVERSION',
            foreignKey: conversionRecord.id
          }
        });

        return {
          success: true,
          message: "Unit conversion completed successfully",
          conversionId: conversionRecord.id,
          sourceVariant: {
            id: sourceVariant.id,
            name: sourceVariant.name,
            previousStock: sourceVariant.closingQty,
            newStock: updatedSource.closingQty
          },
          targetVariant: {
            id: targetVariant.id,
            name: targetVariant.name,
            previousStock: targetVariant.closingQty,
            newStock: updatedTarget.closingQty
          }
        };
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }),

  // Get conversion history
  getConversionHistory: asyncHandler(async (req, res, next) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        depotId, 
        startDate, 
        endDate 
      } = req.query;

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const where = {};

      // Apply depot filter (respect user permissions)
      if (req.user?.role === "DEPOT_ADMIN" && req.user.depotId) {
        where.depotId = req.user.depotId;
      } else if (depotId) {
        const dId = parseInt(depotId, 10);
        if (!isNaN(dId)) {
          where.depotId = dId;
        }
      }

      // Apply date filters
      if (startDate || endDate) {
        where.performedAt = {};
        if (startDate) {
          where.performedAt.gte = new Date(startDate);
        }
        if (endDate) {
          where.performedAt.lte = new Date(endDate);
        }
      }

      const [history, totalRecords] = await prisma.$transaction([
        prisma.unitConversionHistory.findMany({
          where,
          orderBy: { performedAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum
        }),
        prisma.unitConversionHistory.count({ where })
      ]);

      res.json({
        data: history,
        totalRecords,
        currentPage: pageNum,
        totalPages: Math.ceil(totalRecords / limitNum)
      });
    } catch (error) {
      next(error);
    }
  }),

  // Get conversion suggestions (placeholder)
  getConversionSuggestions: asyncHandler(async (req, res, next) => {
    const sourceVariantId = parseInt(req.params.sourceVariantId, 10);
    if (isNaN(sourceVariantId)) {
      return next(createError(400, "Invalid sourceVariantId parameter"));
    }

    try {
      // For now, return empty suggestions
      // This can be enhanced later with ML or business rule-based suggestions
      res.json([]);
    } catch (error) {
      next(error);
    }
  }),

  // Perform bulk conversion
  performBulkConversion: asyncHandler(async (req, res, next) => {
    try {
      const data = bulkConversionSchema.parse(req.body);
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';

      const results = [];
      const errors = [];

      // Perform all conversions in a single transaction with increased timeout
      await prisma.$transaction(async (tx) => {
        // Batch fetch all required variants
        const allVariantIds = [
          ...data.conversions.map(c => c.sourceVariantId),
          ...data.conversions.map(c => c.targetVariantId)
        ];
        const uniqueVariantIds = [...new Set(allVariantIds)];
        
        const allVariants = await tx.depotProductVariant.findMany({
          where: { id: { in: uniqueVariantIds } }
        });
        
        const variantMap = new Map(allVariants.map(v => [v.id, v]));
        
        for (const conversion of data.conversions) {
          try {
            const sourceVariant = variantMap.get(conversion.sourceVariantId);
            const targetVariant = variantMap.get(conversion.targetVariantId);

            if (!sourceVariant || !targetVariant) {
              throw new Error(`Variants not found for conversion ${conversion.sourceVariantId} -> ${conversion.targetVariantId}`);
            }

            // Check stock
            if (sourceVariant.closingQty < conversion.sourceQuantity) {
              throw new Error(`Insufficient stock for ${sourceVariant.name}. Available: ${sourceVariant.closingQty}, Required: ${conversion.sourceQuantity}`);
            }

            // Update stocks
            const [updatedSource, updatedTarget] = await Promise.all([
              tx.depotProductVariant.update({
                where: { id: conversion.sourceVariantId },
                data: { closingQty: sourceVariant.closingQty - conversion.sourceQuantity }
              }),
              tx.depotProductVariant.update({
                where: { id: conversion.targetVariantId },
                data: { closingQty: targetVariant.closingQty + conversion.targetQuantity }
              })
            ]);

            // Update local cache for subsequent conversions
            sourceVariant.closingQty -= conversion.sourceQuantity;
            targetVariant.closingQty += conversion.targetQuantity;

            // Create history record
            const conversionRecord = await tx.unitConversionHistory.create({
              data: {
                depotId: data.depotId,
                sourceVariantId: conversion.sourceVariantId,
                targetVariantId: conversion.targetVariantId,
                sourceQuantity: conversion.sourceQuantity,
                targetQuantity: conversion.targetQuantity,
                sourceVariantName: sourceVariant.name,
                targetVariantName: targetVariant.name,
                performedBy: userName,
                performedById: userId,
                notes: data.notes,
                performedAt: new Date()
              }
            });

            // Create stock ledger entries
            const transactionDate = new Date();
            
            // Source variant - outward movement (issuedQty)
            await tx.stockLedger.create({
              data: {
                productId: sourceVariant.productId,
                variantId: conversion.sourceVariantId,
                depotId: data.depotId,
                transactionDate,
                receivedQty: 0,
                issuedQty: conversion.sourceQuantity,
                module: 'UNIT_CONVERSION',
                foreignKey: conversionRecord.id
              }
            });

            // Target variant - inward movement (receivedQty)
            await tx.stockLedger.create({
              data: {
                productId: targetVariant.productId,
                variantId: conversion.targetVariantId,
                depotId: data.depotId,
                transactionDate,
                receivedQty: conversion.targetQuantity,
                issuedQty: 0,
                module: 'UNIT_CONVERSION',
                foreignKey: conversionRecord.id
              }
            });

            results.push({
              success: true,
              sourceVariant: {
                id: sourceVariant.id,
                name: sourceVariant.name,
                previousStock: sourceVariant.closingQty + conversion.sourceQuantity,
                newStock: updatedSource.closingQty
              },
              targetVariant: {
                id: targetVariant.id,
                name: targetVariant.name,
                previousStock: targetVariant.closingQty - conversion.targetQuantity,
                newStock: updatedTarget.closingQty
              }
            });
          } catch (error) {
            errors.push(error.message);
          }
        }
      }, {
        timeout: 30000 // Increase timeout to 30 seconds
      });

      res.json({
        success: errors.length === 0,
        results,
        errors
      });
    } catch (error) {
      next(error);
    }
  })
};
