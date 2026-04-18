const express = require('express');
const router = express.Router();
const controller = require('../controllers/meterController');
const { verifyToken, requireManagerOrAdmin } = require('../middleware/authMiddleware');

router.get('/', verifyToken, requireManagerOrAdmin, controller.list);
router.get('/mine', verifyToken, controller.mine);
router.post('/predict', verifyToken, requireManagerOrAdmin, controller.predict);
router.post('/derive', verifyToken, requireManagerOrAdmin, controller.derive);
router.post('/', verifyToken, requireManagerOrAdmin, controller.create);
router.patch('/:id', verifyToken, requireManagerOrAdmin, controller.update);
router.delete('/:id', verifyToken, requireManagerOrAdmin, controller.remove);

module.exports = router;
