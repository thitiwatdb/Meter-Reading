const express = require("express")
const router = express.Router();
const controller = require("../controllers/bookingController")
const { verifyToken, requireManagerOrAdmin } = require("../middleware/authMiddleware")

router.get("/mine", verifyToken, controller.mine)

router.get("/", verifyToken, requireManagerOrAdmin, controller.list)
router.get("/pending/count", verifyToken, requireManagerOrAdmin, controller.pendingCount)
router.get("/ready-checkin/count", verifyToken, requireManagerOrAdmin, controller.readyForCheckInCount)

router.post("/", verifyToken, requireManagerOrAdmin, controller.create)
router.post("/online", verifyToken, controller.createOnline)
router.post("/walkin", verifyToken, requireManagerOrAdmin, controller.createForTenant)

router.post("/:id/approve", verifyToken, requireManagerOrAdmin, controller.approve)
router.post("/:id/reject", verifyToken, requireManagerOrAdmin, controller.reject)
router.post("/:id/cancel", verifyToken, controller.cancel)
router.post("/:id/allocate", verifyToken, requireManagerOrAdmin, controller.allocate)
router.post("/:id/reallocate", verifyToken, requireManagerOrAdmin, controller.reallocate)

router.get("/:id/allocatable-rooms", verifyToken, requireManagerOrAdmin, controller.allocatableRooms)

module.exports = router;
