const prisma = require("../config/db");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Create a new delivery address
// @route   POST /api/delivery-addresses
// @access  Private (Member only)
const createDeliveryAddress = asyncHandler(async (req, res) => {
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
    label
  } = req.body;

  const userId = req.user.id;

  // Find the member associated with the user
  const member = await prisma.member.findUnique({
    where: { userId: parseInt(userId) }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // If this is the first address or isDefault is true, handle default address settings
  if (isDefault) {
    // Reset any existing default addresses for this member
    await prisma.deliveryAddress.updateMany({
      where: { memberId: member.id, isDefault: true },
      data: { isDefault: false }
    });
  }

  // Create the new address
  const newAddress = await prisma.deliveryAddress.create({
    data: {
      memberId: member.id,
      recipientName,
      mobile,
      plotBuilding,
      streetArea,
      landmark,
      pincode,
      city,
      state,
      label,
      isDefault: isDefault || false
    }
  });

  res.status(201).json(newAddress);
});

// @desc    Get all delivery addresses for a member
// @route   GET /api/delivery-addresses
// @access  Private (Member only)
const getDeliveryAddresses = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Find the member associated with the user
  const member = await prisma.member.findUnique({
    where: { userId: parseInt(userId) }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // Get all addresses for this member
  const addresses = await prisma.deliveryAddress.findMany({
    where: { memberId: member.id },
    orderBy: { isDefault: 'desc' }
  });

  res.status(200).json(addresses);
});

// @desc    Get a specific delivery address
// @route   GET /api/delivery-addresses/:id
// @access  Private (Member only)
const getDeliveryAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id; // Keep this one
  const addressId = parseInt(req.params.id); // Keep this one, with parseInt

  if (isNaN(addressId)) {
    return res.status(400).json({ message: "Invalid address ID format" });
  }


  // Find the member associated with the user
  const member = await prisma.member.findUnique({
    where: { userId: parseInt(userId) }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // Get the specific address
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  // Make sure the address belongs to this member
  if (address.memberId !== member.id) {
    return res.status(403).json({ message: "Not authorized to access this address" });
  }

  res.status(200).json(address);
});

// @desc    Update a delivery address
// @route   PUT /api/delivery-addresses/:id
// @access  Private (Member only)
const updateDeliveryAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id;
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
    label // Add label to destructuring
  } = req.body;

  // Find the member associated with the user
  const member = await prisma.member.findUnique({
    where: { userId: parseInt(userId) }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // Get the specific address
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  // Make sure the address belongs to this member
  if (address.memberId !== member.id) {
    return res.status(403).json({ message: "Not authorized to update this address" });
  }

  // If isDefault is true, update other addresses
  if (isDefault) {
    await prisma.deliveryAddress.updateMany({
      where: {
        memberId: member.id,
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
      recipientName,
      mobile,
      plotBuilding,
      streetArea,
      landmark,
      pincode,
      city,
      state,
      label: label !== undefined ? label : address.label,
      isDefault: isDefault !== undefined ? isDefault : address.isDefault
    }
  });

  res.status(200).json(updatedAddress);
});

// @desc    Delete a delivery address
// @route   DELETE /api/delivery-addresses/:id
// @access  Private (Member only)
const deleteDeliveryAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const addressId = parseInt(req.params.id);

  if (isNaN(addressId)) {
    return res.status(400).json({ message: "Invalid address ID format" });
  }


  // Find the member associated with the user
  const member = await prisma.member.findUnique({
    where: { userId: parseInt(userId) }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // Get the specific address
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  // Make sure the address belongs to this member
  if (address.memberId !== member.id) {
    return res.status(403).json({ message: "Not authorized to delete this address" });
  }

  try {
    // Attempt to delete the address
    await prisma.deliveryAddress.delete({
      where: { id: addressId }
    });

    // If the deleted address was the default one, set a new default
    if (address.isDefault) {
      const remainingAddresses = await prisma.deliveryAddress.findMany({
        where: { memberId: member.id }, // Consider only active addresses if soft delete is implemented later
        orderBy: { createdAt: 'desc' }, // Or some other logic to pick the next default
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
      // You can check error.meta.field_name to see which foreign key was violated if needed for more specific messages
      return res.status(400).json({
        message: "Cannot delete this address because it is currently in use (e.g., by an active subscription or delivery schedule). Please update or remove those references before deleting the address."
      });
    }
    // For other errors, pass to the default error handler
    // Make sure your asyncHandler or a global error handler can process this 'next(error)' call.
    // If not, you might want to return a generic 500 error here.
    console.error('Error deleting delivery address:', error); // Log the actual error for debugging
    return res.status(500).json({ message: "Failed to delete address. " + error.message });
  }
});

// @desc    Set an address as default
// @route   PATCH /api/delivery-addresses/:id/set-default
// @access  Private (Member only)
const setDefaultAddress = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const addressId = parseInt(req.params.id);

  if (isNaN(addressId)) {
    return res.status(400).json({ message: "Invalid address ID format" });
  }


  // Find the member associated with the user
  const member = await prisma.member.findUnique({
    where: { userId: parseInt(userId) }
  });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  // Get the specific address
  const address = await prisma.deliveryAddress.findUnique({
    where: { id: addressId }
  });

  if (!address) {
    return res.status(404).json({ message: "Address not found" });
  }

  // Make sure the address belongs to this member
  if (address.memberId !== member.id) {
    return res.status(403).json({ message: "Not authorized to update this address" });
  }

  // Update all addresses to not be default
  await prisma.deliveryAddress.updateMany({
    where: {
      memberId: member.id,
      isDefault: true
    },
    data: { isDefault: false }
  });

  // Set this address as default
  const updatedAddress = await prisma.deliveryAddress.update({
    where: { id: addressId },
    data: { isDefault: true }
  });

  res.status(200).json(updatedAddress);
});

module.exports = {
  createDeliveryAddress,
  getDeliveryAddresses,
  getDeliveryAddress,
  updateDeliveryAddress,
  deleteDeliveryAddress,
  setDefaultAddress
};
