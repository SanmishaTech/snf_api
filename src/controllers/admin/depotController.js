const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Create a new Depot
exports.createDepot = async (req, res) => {
    const { name, address, contactPerson, contactNumber } = req.body;
    try {
        if (!name || !address) {
            return res.status(400).json({ error: 'Name and Address are required fields.' });
        }

        const existingDepot = await prisma.depot.findUnique({
            where: { name },
        });

        if (existingDepot) {
            return res.status(400).json({ error: 'A depot with this name already exists.' });
        }

        const newDepot = await prisma.depot.create({
            data: {
                name,
                address,
                contactPerson,
                contactNumber,
            },
        });
        res.status(201).json(newDepot);
    } catch (error) {
        console.error('Error creating depot:', error);
        res.status(500).json({ error: 'Failed to create depot', details: error.message });
    }
};

// Get all Depots with pagination, search, and sort
exports.getAllDepots = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || 'name'; // Default sort by name
    const sortOrder = req.query.sortOrder === 'desc' ? 'desc' : 'asc';

    const whereClause = {
        AND: search ? [
            {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { address: { contains: search, mode: 'insensitive' } },
                ],
            },
        ] : [],
    };

    try {
        const depots = await prisma.depot.findMany({
            where: whereClause,
            skip: skip,
            take: limit,
            orderBy: {
                [sortBy]: sortOrder,
            },
        });

        const totalRecords = await prisma.depot.count({
            where: whereClause,
        });

        const totalPages = Math.ceil(totalRecords / limit);

        res.status(200).json({
            depots,
            page,
            totalPages,
            totalRecords,
        });
    } catch (error) {
        console.error('Error fetching depots:', error);
        res.status(500).json({ error: 'Failed to fetch depots', details: error.message });
    }
};

// Get all Depots for a list (ID and Name only)
exports.getAllDepotsList = async (req, res) => {
    try {
        const depots = await prisma.depot.findMany({
            select: {
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
        res.status(200).json(depots);
    } catch (error) {
        console.error('Error fetching depots list:', error);
        res.status(500).json({ error: 'Failed to fetch depots list', details: error.message });
    }
};

// Get a single Depot by ID
exports.getDepotById = async (req, res) => {
    const { id } = req.params;
    try {
        const depot = await prisma.depot.findUnique({
            where: { id },
        });
        if (!depot) {
            return res.status(404).json({ error: 'Depot not found' });
        }
        res.status(200).json(depot);
    } catch (error) {
        console.error(`Error fetching depot with ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to fetch depot', details: error.message });
    }
};

// Update a Depot by ID
exports.updateDepot = async (req, res) => {
    const { id } = req.params;
    const { name, address, contactPerson, contactNumber } = req.body;

    try {
        if (!name || !address) {
            return res.status(400).json({ error: 'Name and Address are required fields.' });
        }

        // Check if another depot with the new name already exists (if name is being changed)
        if (name) {
            const existingDepot = await prisma.depot.findFirst({
                where: {
                    name: name,
                    id: { not: id }
                }
            });
            if (existingDepot) {
                return res.status(400).json({ error: 'Another depot with this name already exists.' });
            }
        }

        const updatedDepot = await prisma.depot.update({
            where: { id },
            data: {
                name,
                address,
                contactPerson,
                contactNumber,
            },
        });
        res.status(200).json(updatedDepot);
    } catch (error) {
        console.error(`Error updating depot with ID ${id}:`, error);
        if (error.code === 'P2025') { // Prisma error code for record not found
            return res.status(404).json({ error: 'Depot not found' });
        }
        res.status(500).json({ error: 'Failed to update depot', details: error.message });
    }
};

// Delete a Depot by ID
exports.deleteDepot = async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.depot.delete({
            where: { id },
        });
        res.status(204).send(); // No content, successful deletion
    } catch (error) {
        console.error(`Error deleting depot with ID ${id}:`, error);
        if (error.code === 'P2025') { // Prisma error code for record not found
            return res.status(404).json({ error: 'Depot not found' });
        }
        res.status(500).json({ error: 'Failed to delete depot', details: error.message });
    }
};
