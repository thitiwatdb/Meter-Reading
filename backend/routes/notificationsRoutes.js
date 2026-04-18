const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificationsController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/mine', verifyToken, controller.mine);

module.exports = router;
