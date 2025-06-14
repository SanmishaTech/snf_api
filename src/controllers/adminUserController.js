const prisma = require('../config/db');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get user details by Member ID for admin
// @route   GET /api/admin/users/:memberId (Note: route param is still userId in adminRoutes.js, but we treat it as memberId here)
// @access  Private/Admin
const adminGetUserById = asyncHandler(async (req, res) => {
  const memberId = req.params.userId; // The route param is named userId, but it's conceptually a memberId from the list
  
  const memberProfile = await prisma.member.findUnique({
    where: { id: parseInt(memberId) }, // Assuming Member ID is an Int
    include: {
      user: true, // Include the associated User data
    },
  });

  if (!memberProfile || !memberProfile.user) {
    res.status(404);
    throw new Error('Member or associated user not found');
  }

  // Avoid sending password hash from the user object
  const { password, ...userDetails } = memberProfile.user;
  res.json(userDetails);
});

// @desc    Update user details by Member ID for admin
// @route   PUT /api/admin/users/:memberId (Note: route param is still userId in adminRoutes.js, but we treat it as memberId here)
// @access  Private/Admin
const adminUpdateUserById = asyncHandler(async (req, res) => {
  const memberId = req.params.userId; // The route param is named userId, but it's conceptually a memberId
  const { name, email, mobile } = req.body;

  const memberProfile = await prisma.member.findUnique({
    where: { id: parseInt(memberId) },
  });

  if (!memberProfile) {
    res.status(404);
    throw new Error('Member not found');
  }

  const actualUserId = memberProfile.userId; // Get the actual User ID from the member profile

  // Fetch the user to check current email if email is being changed
  const currentUserState = await prisma.user.findUnique({
    where: { id: actualUserId },
  });

  if (!currentUserState) {
    res.status(404); // Should not happen if memberProfile.userId is valid
    throw new Error('Associated user account not found');
  }

  // Prevent email conflicts if email is being changed
  if (email && email !== currentUserState.email) {
    const existingUserWithEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUserWithEmail && existingUserWithEmail.id !== actualUserId) {
      res.status(400);
      throw new Error('Email already in use by another account');
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: actualUserId },
    data: {
      name: name !== undefined ? name : currentUserState.name,
      email: email !== undefined ? email : currentUserState.email,
      mobile: mobile !== undefined 
        ? (mobile === '' ? null : parseInt(mobile, 10)) 
        : currentUserState.mobile,
      // Potentially update other fields as needed
    },
  });

  // Avoid sending password hash
  const { password, ...userDetails } = updatedUser;
  res.json(userDetails);
});

// @desc    Toggle active status of a user associated with a member by Member ID
// @route   PATCH /api/admin/members/:memberId/status
// @access  Private/Admin
const adminToggleMemberStatus = asyncHandler(async (req, res) => {
  const memberId = req.params.memberId; // Note: param name will be 'memberId' from the route
  const { active } = req.body; // Expecting { active: boolean }

  if (typeof active !== 'boolean') {
    res.status(400);
    throw new Error('Invalid status value. Please provide a boolean for active status.');
  }

  const memberProfile = await prisma.member.findUnique({
    where: { id: parseInt(memberId) }, // Assuming Member ID is an Int
  });

  if (!memberProfile) {
    res.status(404);
    throw new Error('Member not found');
  }

  const actualUserId = memberProfile.userId;

  const updatedUser = await prisma.user.update({
    where: { id: actualUserId },
    data: {
      active: active,
    },
  });

  // Avoid sending password hash
  const { password, ...userDetails } = updatedUser;
  res.json(userDetails);
});

module.exports = {
  adminGetUserById,
  adminUpdateUserById,
  adminToggleMemberStatus, // Add the new function here
};
