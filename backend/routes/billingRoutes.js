const express = require('express');
const router = express.Router();
const controller = require('../controllers/billingController');
const { verifyToken, requireManagerOrAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, requireManagerOrAdmin, controller.listBills);
router.get('/mine/:id/items', verifyToken, controller.getMyBillItems);
router.get('/:id/items', verifyToken, requireManagerOrAdmin, controller.getBillItems);
router.post('/', verifyToken, requireManagerOrAdmin, controller.createBill);
router.post('/generate', verifyToken, requireManagerOrAdmin, controller.generateBillFromReadings);

router.get('/mine/overview', verifyToken, controller.myOverview);
router.get('/mine', verifyToken, controller.listMyBills);

module.exports = router;
