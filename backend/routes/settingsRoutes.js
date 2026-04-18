const express = require('express');
const router = express.Router();
const controller = require('../controllers/settingsController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, requireAdmin, controller.getAll);
router.post('/', verifyToken, requireAdmin, controller.setMany);

module.exports = router;

