const express = require('express');
const router = express.Router();
const controller = require('../controllers/dashboardController');
const { verifyToken, requireManagerOrAdmin } = require('../middleware/authMiddleware');

router.get('/summary', verifyToken, requireManagerOrAdmin, controller.summary);

module.exports = router;

