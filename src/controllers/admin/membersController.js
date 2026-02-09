// backend/src/controllers/admin/membersController.js
const asyncHandler = require('express-async-handler');
const prisma = require('../../config/db'); // Import Prisma client

/**
 * @desc    Get all members (with role 'MEMBER') with their wallet balances, supporting pagination, search, and sorting.
 * @route   GET /api/admin/members
 * @access  Private/Admin
 */
const getAllMembersWithWallets = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    // Default sort by name, can be overridden by query params e.g. sortBy=email&sortOrder=desc
    const sortBy = req.query.sortBy || "name"; 
    const sortOrder = req.query.sortOrder === "desc" ? "desc" : "asc";

    const whereClause = {
        role: 'MEMBER', // Filter by role MEMBER - Case-sensitive, ensure 'MEMBER' is correct.
        AND: search ? [ // Apply search if search term exists
            {
                OR: [
                    { name: { contains: search } }, // Search for name (case-sensitive by default now)
                    { email: { contains: search } }, // Search for email (case-sensitive by default now)
                ],
            },
        ] : [],
    };

    const totalRecords = await prisma.user.count({
        where: whereClause,
    });
    const totalPages = Math.ceil(totalRecords / limit);

    if (totalRecords === 0) {
        return res.status(200).json({
            members: [],
            page,
            totalPages,
            totalRecords,
            message: 'No members found matching your criteria.'
        });
    }

    // Build orderBy based on sortBy field
    let orderBy;
    if (sortBy === 'walletBalance') {
        // walletBalance is on the member relation, not on User
        orderBy = {
            member: {
                walletBalance: sortOrder
            }
        };
    } else {
        // For other fields like name, email, active that exist on User model
        orderBy = {
            [sortBy]: sortOrder
        };
    }

    const membersData = await prisma.user.findMany({
        where: whereClause,
        select: {
            id: true,
            userUniqueId: true,
            createdAt: true,
            name: true,
            email: true,
            role: true,
            active: true,
            member: {      // User has a relation to Member model named 'member'
                select: {
                    id: true,
                    walletBalance: true,
                }
            }
        },
        skip: skip,
        take: limit,
        orderBy: orderBy,
    });

    const membersWithWallets = membersData.map(user => ({
        _id: user.member?.id, // Use the ID from the Member table for _id
        id: user.member?.id,  // Use the ID from the Member table for id
        userId: user.id,      // Keep user.id as userId if needed elsewhere
        userUniqueId: user.userUniqueId || `${new Date(user.createdAt).getFullYear()}-${String(user.id).padStart(4, '0')}`,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        walletBalance: user.member?.walletBalance ?? 0, // Access balance via user.member.wallet
        // It's crucial that every User with role 'MEMBER' has an associated Member record
        // If user.member or user.member.id could be null/undefined, the frontend link might break or need adjustment.
    }));

    res.status(200).json({
        members: membersWithWallets,
        page,
        totalPages,
        totalRecords,
    });
});

module.exports = {
    getAllMembersWithWallets,
};
