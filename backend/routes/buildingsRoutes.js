const express = require("express");
const router = express.Router();
const controller = require("../controllers/buildingController")
const { verifyToken, requireManagerOrAdmin } = require("../middleware/authMiddleware")

router.get("/", verifyToken, controller.list)
router.post("/", verifyToken, requireManagerOrAdmin, controller.create)
router.patch("/:id", verifyToken, requireManagerOrAdmin, controller.update)
router.delete("/:id", verifyToken, requireManagerOrAdmin, controller.remove)

module.exports = router;