const express = require('express');
const router = express.Router();
const { getAgencyDeliveriesByDate, updateDeliveryStatus } = require('../controllers/deliveryScheduleController');

const auth = require('../middleware/auth'); // Using the actual authentication middleware

const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: 'Authentication required. User not found.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: You do not have the necessary permissions.' });
        }
        // For AGENCY role, ensure agencyId is present
        if (req.user.role === 'AGENCY' && !req.user.agencyId) {
            return res.status(403).json({ error: 'Forbidden: Agency user must have an associated agencyId.' });
        }
        next();
    };
};

// Route to get deliveries for the logged-in agency by date
// GET /api/delivery-schedules/agency/by-date?date=YYYY-MM-DD
router.get('/agency/by-date', auth, getAgencyDeliveriesByDate);

// Route to update the status of a specific delivery entry
// PUT /api/delivery-schedules/:id/status
router.put('/:id/status', auth, updateDeliveryStatus);

module.exports = router;
