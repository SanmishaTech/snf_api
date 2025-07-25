const prisma = require("../../config/db");
const asyncHandler = require("../../middleware/asyncHandler");

// @desc    Get all delivery addresses for a specific member (Admin only)
// @route   GET /api/admin/delivery-addresses?memberId=:memberId
// @access  Private/Admin
const getAdminDeliveryAddresses = asyncHandler(async (req, res) => {
  const { memberId } = req.query;

  if (!memberId) {
    return res.status(400).json({ message: "Member ID is required" });
  }

  // Verify that the member exists
  const member = await prisma.member.findUnique({
    where: { id: parseInt(memberId) },
    include: {
      user: {
        select: { id: true, name: true, email: true }
      }
    }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // Get all addresses for this member
  const addresses = await prisma.deliveryAddress.findMany({
    where: { memberId: parseInt(memberId) },
    orderBy: { isDefault: 'desc' },
    include: { 
      location: {
        include: {
          city: true,
          agency: true
        }
      }
    }
  });

  res.status(200).json(addresses);
});

// @desc    Get a specific delivery address (Admin only)
// @route   GET /api/admin/delivery-addresses/:id
// @access  Private/Admin
const getAdminDeliveryAddress = asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.id);

  if (isNaN(addressId)) {
    return res.status(400).json({ message: "Invalid address ID format" });
  }

  // Get the specific address with member information
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId },
    include: { 
      location: {
        include: {
          city: true,
          agency: true
        }
      },
      member: {
        include: {
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      }
    }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  res.status(200).json(address);
});

// @desc    Update a delivery address (Admin only)
// @route   PUT /api/admin/delivery-addresses/:id
// @access  Private/Admin
const updateAdminDeliveryAddress = asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.id);

  if (isNaN(addressId)) {
    return res.status(400).json({ message: "Invalid address ID format" });
  }

  const {
    recipientName,
    mobile,
    plotBuilding,
    streetArea,
    landmark,
    pincode,
    city,
    state,
    isDefault,
    label,
    locationId
  } = req.body;

  // Get the specific address
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  // If isDefault is true, update other addresses for this member
  if (isDefault) {
    await prisma.deliveryAddress.updateMany({
      where: {
        memberId: address.memberId,
        isDefault: true,
        id: { not: addressId }
      },
      data: { isDefault: false }
    });
  }

  // Update the address
  const updatedAddress = await prisma.deliveryAddress.update({
    where: { id: addressId },
    data: {
      recipientName: recipientName !== undefined ? recipientName : address.recipientName,
      mobile: mobile !== undefined ? mobile : address.mobile,
      plotBuilding: plotBuilding !== undefined ? plotBuilding : address.plotBuilding,
      streetArea: streetArea !== undefined ? streetArea : address.streetArea,
      landmark: landmark !== undefined ? landmark : address.landmark,
      pincode: pincode !== undefined ? pincode : address.pincode,
      city: city !== undefined ? city : address.city,
      state: state !== undefined ? state : address.state,
      label: label !== undefined ? label : address.label,
      isDefault: isDefault !== undefined ? isDefault : address.isDefault,
      locationId: locationId !== undefined ? (locationId ? parseInt(locationId) : null) : address.locationId
    },
    include: { 
      location: {
        include: {
          city: true,
          agency: true
        }
      }
    }
  });

  res.status(200).json(updatedAddress);
});

// @desc    Delete a delivery address (Admin only)
// @route   DELETE /api/admin/delivery-addresses/:id
// @access  Private/Admin
const deleteAdminDeliveryAddress = asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.id);

  if (isNaN(addressId)) {
    return res.status(400).json({ message: "Invalid address ID format" });
  }

  // Get the specific address
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  try {
    // Attempt to delete the address
    await prisma.deliveryAddress.delete({
      where: { id: addressId }
    });

    // If the deleted address was the default one, set a new default
    if (address.isDefault) {
      const remainingAddresses = await prisma.deliveryAddress.findMany({
        where: { memberId: address.memberId },
        orderBy: { createdAt: 'desc' },
        take: 1
      });

      if (remainingAddresses.length > 0) {
        await prisma.deliveryAddress.update({
          where: { id: remainingAddresses[0].id },
          data: { isDefault: true }
        });
      }
    }

    res.status(200).json({ message: "Address deleted successfully" });

  } catch (error) {
    if (error.code === 'P2003') { // Prisma foreign key constraint violation
      return res.status(400).json({
        message: "Cannot delete this address because it is currently in use (e.g., by an active subscription or delivery schedule). Please update or remove those references before deleting the address."
      });
    }
    console.error('Error deleting delivery address:', error);
    return res.status(500).json({ message: "Failed to delete address. " + error.message });
  }
});

// @desc    Create a new delivery address for a member (Admin only)
// @route   POST /api/admin/delivery-addresses
// @access  Private/Admin
const createAdminDeliveryAddress = asyncHandler(async (req, res) => {
  const {
    memberId,
    recipientName,
    mobile,
    plotBuilding,
    streetArea,
    landmark,
    pincode,
    city,
    state,
    isDefault,
    label,
    locationId
  } = req.body;

  if (!memberId) {
    return res.status(400).json({ message: "Member ID is required" });
  }

  // Verify that the member exists
  const member = await prisma.member.findUnique({
    where: { id: parseInt(memberId) }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // If this is the first address or isDefault is true, handle default address settings
  if (isDefault) {
    // Reset any existing default addresses for this member
    await prisma.deliveryAddress.updateMany({
      where: { memberId: parseInt(memberId), isDefault: true },
      data: { isDefault: false }
    });
  }

  // Create the new address
  const newAddress = await prisma.deliveryAddress.create({
    data: {
      memberId: parseInt(memberId),
      recipientName,
      mobile,
      plotBuilding,
      streetArea,
      landmark,
      pincode,
      city,
      state,
      label,
      isDefault: isDefault || false,
      locationId: locationId ? parseInt(locationId) : null
    },
    include: { 
      location: {
        include: {
          city: true,
          agency: true
        }
      }
    }
  });

  res.status(201).json(newAddress);
});

// @desc    Set an address as default (Admin only)
// @route   PATCH /api/admin/delivery-addresses/:id/set-default
// @access  Private/Admin
const setAdminDefaultAddress = asyncHandler(async (req, res) => {
  const addressId = parseInt(req.params.id);

  if (isNaN(addressId)) {
    return res.status(400).json({ message: "Invalid address ID format" });
  }

  // Get the specific address
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  // Update all addresses to not be default for this member
  await prisma.deliveryAddress.updateMany({
    where: {
      memberId: address.memberId,
      isDefault: true
    },
    data: { isDefault: false }
  });

  // Set this address as default
  const updatedAddress = await prisma.deliveryAddress.update({
    where: { id: addressId },
    data: { isDefault: true },
    include: { 
      location: {
        include: {
          city: true,
          agency: true
        }
      }
    }
  });

  res.status(200).json(updatedAddress);
});

module.exports = {
  getAdminDeliveryAddresses,
  getAdminDeliveryAddress,
  updateAdminDeliveryAddress,
  deleteAdminDeliveryAddress,
  createAdminDeliveryAddress,
  setAdminDefaultAddress
};