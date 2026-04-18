const express = require('express');
const router = express.Router();
const controller = require('../controllers/maintenanceController');
const { verifyToken, requireManagerOrAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, controller.list);
router.post('/', verifyToken, controller.create);
router.post('/:id/status', verifyToken, requireManagerOrAdmin, controller.updateStatus);

module.exports = router;

