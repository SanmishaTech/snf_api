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
    const active = req.query.active; // Can be "true", "false" or undefined (all)
    // Default sort by name, can be overridden by query params e.g. sortBy=email&sortOrder=desc
    const sortBy = req.query.sortBy || "name"; 
    const sortOrder = req.query.sortOrder === "desc" ? "desc" : "asc";

    const whereClause = {
        role: 'MEMBER', // Filter by role MEMBER
        AND: [
            search ? {
                OR: [
                    { name: { contains: search } },
                    { email: { contains: search } },
                    { mobile: { contains: search } },
                    { userUniqueId: { contains: search } },
                ],
            } : {},
            (active === "true" || active === "false") ? {
                active: active === "true"
            } : {},
            // If the requester is an Agency, only show members assigned to them via subscriptions
            req.user.role === 'AGENCY' ? {
                member: {
                    subscriptions: {
                        some: {
                            agencyId: req.user.agencyId
                        }
                    }
                }
            } : {}
        ],
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
        orderBy = {
            member: {
                walletBalance: sortOrder
            }
        };
    } else {
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
            mobile: true,
            role: true,
            active: true,
            member: {      
                select: {
                    id: true,
                    walletBalance: true,
                    subscriptions: {
                        where: {
                            // If agency is requesting, only look at THEIR subscriptions for this member
                            ...(req.user.role === 'AGENCY' ? { agencyId: req.user.agencyId } : {}),
                            paymentStatus: 'PAID' // Only active/paid subscriptions count for expiry
                        },
                        orderBy: {
                            expiryDate: 'desc'
                        },
                        take: 1,
                        select: {
                            expiryDate: true
                        }
                    }
                }
            }
        },
        skip: skip,
        take: limit,
        orderBy: orderBy,
    });

    const membersWithWallets = membersData.map(user => {
        const latestSubscription = user.member?.subscriptions?.[0];
        return {
            _id: user.member?.id,
            id: user.member?.id,
            userId: user.id,
            userUniqueId: user.userUniqueId || `${new Date(user.createdAt).getFullYear()}-${String(user.id).padStart(4, '0')}`,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            role: user.role,
            active: user.active,
            walletBalance: user.member?.walletBalance ?? 0,
            subscriptionExpiring: latestSubscription?.expiryDate || null,
        };
    });

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
