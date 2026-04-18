const express = require('express');
const router = express.Router();
const controller = require('../controllers/paymentController');
const { verifyToken, requireManagerOrAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, requireManagerOrAdmin, controller.list);
router.post('/', verifyToken, requireManagerOrAdmin, controller.create);
router.post('/:id/confirm', verifyToken, requireManagerOrAdmin, controller.confirm);

router.get('/qr/preview', verifyToken, controller.generateQrPreview);
router.post('/mine', verifyToken, controller.createSelf);

module.exports = router;

