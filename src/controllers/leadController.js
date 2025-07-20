const asyncHandler = require('express-async-handler');
const prisma = require('../config/db'); // Prisma Client

/**
 * @desc    Create a new lead
 * @route   POST /api/leads
 * @access  Public
 */
const createLead = asyncHandler(async (req, res) => {
  const {
    name,
    mobile,
    email,
    plotBuilding,
    streetArea,
    landmark,
    pincode,
    city,
    state,
    productId,
    isDairyProduct,
    notes,
  } = req.body;

  // Validate required fields
  if (!name || !mobile || !plotBuilding || !streetArea || !pincode || !city || !state) {
    res.status(400);
    throw new Error('Please provide all required fields: name, mobile, plotBuilding, streetArea, pincode, city, state');
  }

  // Validate mobile number
  if (!/^\d{10,}$/.test(mobile)) {
    res.status(400);
    throw new Error('Mobile number must be at least 10 digits and contain only numbers');
  }

  // Validate pincode
  if (!/^\d{6}$/.test(pincode)) {
    res.status(400);
    throw new Error('Pincode must be exactly 6 digits');
  }

  try {
    const lead = await prisma.lead.create({
      data: {
        name,
        mobile,
        email: email || null,
        plotBuilding,
        streetArea,
        landmark: landmark || null,
        pincode,
        city,
        state,
        productId: productId ? parseInt(productId, 10) : null,
        isDairyProduct: Boolean(isDairyProduct),
        notes: notes || null,
        status: 'NEW',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Lead created successfully. We will contact you soon!',
      data: lead,
    });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lead',
    });
  }
});

/**
 * @desc    Get all leads with pagination and filtering
 * @route   GET /api/leads
 * @access  Private/Admin
 */
const getAllLeads = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || '';
  const status = req.query.status || '';
  const isDairyProduct = req.query.isDairyProduct;

  let whereClause = {};

  // Add search functionality
  if (search) {
    whereClause.OR = [
      { name: { contains: search } },
      { mobile: { contains: search } },
      { email: { contains: search } },
      { city: { contains: search } },
      { pincode: { contains: search } },
    ];
  }

  // Add status filter
  if (status) {
    whereClause.status = status;
  }

  // Add dairy product filter
  if (isDairyProduct !== undefined) {
    whereClause.isDairyProduct = isDairyProduct === 'true';
  }

  try {
    const totalRecords = await prisma.lead.count({ where: whereClause });
    const totalPages = Math.ceil(totalRecords / limit);

    const leads = await prisma.lead.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      data: {
        leads,
        page,
        totalPages,
        totalRecords,
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads',
    });
  }
});

/**
 * @desc    Get a single lead by ID
 * @route   GET /api/leads/:id
 * @access  Private/Admin
 */
const getLeadById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await prisma.lead.findUnique({
      where: {
        id: parseInt(id, 10),
      },
    });

    if (!lead) {
      res.status(404);
      throw new Error('Lead not found');
    }

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead',
    });
  }
});

/**
 * @desc    Update lead status
 * @route   PUT /api/leads/:id/status
 * @access  Private/Admin
 */
const updateLeadStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const validStatuses = ['NEW', 'CONTACTED', 'CONVERTED', 'CLOSED'];

  if (!status || !validStatuses.includes(status)) {
    res.status(400);
    throw new Error(`Status must be one of: ${validStatuses.join(', ')}`);
  }

  try {
    const dataToUpdate = { status };
    if (notes !== undefined) {
      dataToUpdate.notes = notes;
    }

    const updatedLead = await prisma.lead.update({
      where: {
        id: parseInt(id, 10),
      },
      data: dataToUpdate,
    });

    res.status(200).json({
      success: true,
      message: 'Lead status updated successfully',
      data: updatedLead,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404);
      throw new Error('Lead not found');
    }
    console.error('Error updating lead status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lead status',
    });
  }
});

/**
 * @desc    Delete a lead
 * @route   DELETE /api/leads/:id
 * @access  Private/Admin
 */
const deleteLead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.lead.delete({
      where: {
        id: parseInt(id, 10),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      res.status(404);
      throw new Error('Lead not found');
    }
    console.error('Error deleting lead:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete lead',
    });
  }
});

module.exports = {
  createLead,
  getAllLeads,
  getLeadById,
  updateLeadStatus,
  deleteLead,
};