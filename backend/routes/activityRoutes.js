const express = require('express');
const router = express.Router();
const controller = require('../controllers/activityController');
const { verifyToken, requireManagerOrAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, requireManagerOrAdmin, controller.list);

module.exports = router;

