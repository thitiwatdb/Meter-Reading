const express = require("express")
const router = express.Router()
const controller = require("../controllers/roomController")
const { verifyToken, requireManagerOrAdmin } = require("../middleware/authMiddleware")

router.get("/", verifyToken, requireManagerOrAdmin, controller.list)
router.post("/", verifyToken, requireManagerOrAdmin, controller.create)
router.patch("/:id", verifyToken, requireManagerOrAdmin, controller.update)
router.delete("/:id", verifyToken, requireManagerOrAdmin, controller.remove)
router.get("/availability", verifyToken, requireManagerOrAdmin, controller.availability)
router.get("/overview", verifyToken, requireManagerOrAdmin, controller.overview)

module.exports = router;
