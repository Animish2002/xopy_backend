const express = require("express");
const adminController = require("../controller/adminController");
const authMiddleware = require("../middleware/authMiddleware");
const { auth } = require("../utils/supabaseClient");

const router = express.Router();

router.get(
  "/users",
  authMiddleware(["ADMIN"]),
  adminController.getAllUsers
);
router.patch("/users/:id/status", adminController.toggleUserStatus);
router.delete("/users/:id", adminController.deleteUser);

module.exports = router;
