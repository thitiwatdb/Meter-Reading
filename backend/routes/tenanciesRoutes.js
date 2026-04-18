const express = require("express");
const router = express.Router();
const controller = require("../controllers/tenancyController");
const { verifyToken, requireManagerOrAdmin } = require("../middleware/authMiddleware");

router.get("/", verifyToken, requireManagerOrAdmin, controller.list);
router.get("/mine/active-count", verifyToken, controller.activeCountMine);
router.get("/mine/rooms", verifyToken, controller.listMyRooms);

router.post("/from-booking", verifyToken, requireManagerOrAdmin, controller.createFromBooking);

router.post("/:id/moving-out", verifyToken, requireManagerOrAdmin, controller.markMovingOut);

router.post("/:id/end", verifyToken, requireManagerOrAdmin, controller.end);

module.exports = router;
