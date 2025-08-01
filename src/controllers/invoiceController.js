const asyncHandler = require('express-async-handler');
const { 
  generateInvoiceForOrder,
  getInvoicePath,
  invoiceExists 
} = require('../services/invoiceService');
const { regenerateAllInvoices } = require('../scripts/regenerateAllInvoices');
const { regenerateAllInvoicesKeepNumbers } = require('../scripts/regenerateAllInvoicesKeepNumbers');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs').promises;

// @desc    Generate invoice for an order
// @route   POST /api/invoices/generate/:orderId
// @access  Private (Admin)
const generateInvoice = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  
  // Get the product order with all necessary relations
  const productOrder = await prisma.productOrder.findUnique({
    where: { id: orderId },
    include: {
      subscriptions: {
        include: {
          product: true,
          depotProductVariant: true
        }
      },
      member: {
        include: {
          user: true
        }
      }
    }
  });
  
  if (!productOrder) {
    res.status(404);
    throw new Error('Product order not found');
  }
  
  // Check if user has access
  if (req.user.role !== 'ADMIN' && productOrder.member.userId !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to generate invoice for this order');
  }
  
  // Generate the invoice
  const invoiceInfo = await generateInvoiceForOrder(productOrder);
  
  res.status(201).json({
    message: 'Invoice generated successfully',
    invoiceNo: invoiceInfo.invoiceNo,
    pdfPath: invoiceInfo.pdfPath
  });
});

// @desc    Download invoice PDF by order ID
// @route   GET /api/invoices/download/order/:orderId
// @access  Private
const downloadInvoiceByOrder = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  
  // Get the product order
  const productOrder = await prisma.productOrder.findUnique({
    where: { id: orderId },
    include: {
      member: {
        include: {
          user: true
        }
      }
    }
  });
  
  if (!productOrder) {
    res.status(404);
    throw new Error('Product order not found');
  }
  
  // Check if user has access
  if (req.user.role !== 'ADMIN' && productOrder.member.userId !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to download this invoice');
  }
  
  // Get the invoice path
  const invoicePath = getInvoicePath(productOrder.orderNo);
  
  // Check if invoice exists
  const exists = await invoiceExists(productOrder.orderNo);
  if (!exists) {
    // Generate invoice if it doesn't exist
    const fullOrder = await prisma.productOrder.findUnique({
      where: { id: orderId },
      include: {
        subscriptions: {
          include: {
            product: true,
            depotProductVariant: true
          }
        },
        member: {
          include: {
            user: true
          }
        }
      }
    });
    
    await generateInvoiceForOrder(fullOrder);
  }
  
  // Download the PDF
  const invoiceNo = productOrder.orderNo.replace('ORD', 'INV');
  res.download(invoicePath, `${invoiceNo}.pdf`);
});

// @desc    Check if invoice exists for an order
// @route   GET /api/invoices/exists/order/:orderId
// @access  Private
const checkInvoiceExists = asyncHandler(async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  
  // Get the product order
  const productOrder = await prisma.productOrder.findUnique({
    where: { id: orderId },
    select: { orderNo: true }
  });
  
  if (!productOrder) {
    res.status(404);
    throw new Error('Product order not found');
  }
  
  const exists = await invoiceExists(productOrder.orderNo);
  
  res.status(200).json({
    exists,
    invoiceNo: productOrder.orderNo.replace('ORD', 'INV')
  });
});

// @desc    Get invoice information by subscription ID
// @route   GET /api/invoices/subscription/:subscriptionId
// @access  Private
const getInvoiceBySubscription = asyncHandler(async (req, res) => {
  const subscriptionId = parseInt(req.params.subscriptionId);
  const { getInvoiceBySubscription } = require('../services/invoiceService');
  
  // Get the invoice details
  const invoiceDetails = await getInvoiceBySubscription(subscriptionId);
  
  if (!invoiceDetails) {
    res.status(404);
    throw new Error('Invoice not found for this subscription');
  }
  
  // Verify user has access to this subscription
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      member: {
        include: {
          user: true
        }
      }
    }
  });
  
  if (!subscription) {
    res.status(404);
    throw new Error('Subscription not found');
  }
  
  // Check if user has access
  if (req.user.role !== 'ADMIN' && subscription.member.userId !== req.user.id) {
    res.status(403);
    throw new Error('Not authorized to access this invoice');
  }
  
  res.status(200).json(invoiceDetails);
});

// @desc    Regenerate all invoices (with new numbers)
// @route   POST /api/invoices/regenerate-all
// @access  Private (Admin only)
const regenerateAllInvoicesEndpoint = asyncHandler(async (req, res) => {
  // Check if user is admin
  if (req.user.role !== 'ADMIN') {
    res.status(403);
    throw new Error('Only admins can regenerate all invoices');
  }
  
  try {
    console.log(`Admin ${req.user.name} (${req.user.email}) initiated full invoice regeneration`);
    
    // Run the regeneration process
    await regenerateAllInvoices();
    
    // Get the count of successfully regenerated invoices
    const invoiceCount = await prisma.productOrder.count({
      where: {
        paymentStatus: 'PAID',
        invoiceNo: { not: null }
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'All invoices have been successfully regenerated with new numbers',
      regeneratedCount: invoiceCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Invoice regeneration failed:', error);
    res.status(500);
    throw new Error(`Invoice regeneration failed: ${error.message}`);
  }
});

// @desc    Regenerate all invoices (keeping existing numbers)
// @route   POST /api/invoices/regenerate-all-keep-numbers
// @access  Private (Admin only)
const regenerateAllInvoicesKeepNumbersEndpoint = asyncHandler(async (req, res) => {
  // Check if user is admin
  if (req.user.role !== 'ADMIN') {
    res.status(403);
    throw new Error('Only admins can regenerate all invoices');
  }
  
  try {
    console.log(`Admin ${req.user.name} (${req.user.email}) initiated invoice regeneration (preserving numbers)`);
    
    // Run the regeneration process
    await regenerateAllInvoicesKeepNumbers();
    
    // Get the count of successfully regenerated invoices
    const invoiceCount = await prisma.productOrder.count({
      where: {
        paymentStatus: 'PAID',
        invoiceNo: { not: null }
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'All invoices have been successfully regenerated preserving existing numbers',
      regeneratedCount: invoiceCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Invoice regeneration failed:', error);
    res.status(500);
    throw new Error(`Invoice regeneration failed: ${error.message}`);
  }
});

module.exports = {
  generateInvoice,
  downloadInvoiceByOrder,
  checkInvoiceExists,
  getInvoiceBySubscription,
  regenerateAllInvoicesEndpoint,
  regenerateAllInvoicesKeepNumbersEndpoint
};
