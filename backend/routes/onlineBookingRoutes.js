const express = require('express');
const router = express.Router();
const controller = require('../controllers/onlineBookingController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/packages', controller.getPackages);
router.put('/packages', verifyToken, requireAdmin, controller.updatePackages);

module.exports = router;
