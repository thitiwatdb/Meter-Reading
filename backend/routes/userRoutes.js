const express = require("express");
const router = express.Router();
const { verifyToken, requireAdmin, requireManagerOrAdmin } = require("../middleware/authMiddleware")
const {
  getAllUsers,
  updateUser,
  deleteUser,
  searchTenants,
  ensureTenant,
  resetPassword,
  getMyProfile,
  updateMyProfile,
  changeMyPassword
} = require("../controllers/userController");

router.get("/", verifyToken, requireManagerOrAdmin, getAllUsers)
router.get("/search-tenants", verifyToken, requireManagerOrAdmin, searchTenants)
router.post("/ensure-tenant", verifyToken, requireManagerOrAdmin, ensureTenant)

router.get("/me", verifyToken, getMyProfile);
router.patch("/me", verifyToken, updateMyProfile);
router.post("/me/change-password", verifyToken, changeMyPassword);

router.patch("/:id", verifyToken, requireAdmin, updateUser);
router.post("/:id/reset-password", verifyToken, requireAdmin, resetPassword);

router.delete("/:id", verifyToken,requireAdmin,deleteUser);

module.exports = router;
