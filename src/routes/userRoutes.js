const express = require("express");
const photocopycenterController = require("../controller/photocopycenterAuth");
const userController = require("../controller/UserAuth");

const router = express.Router();

const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

router.post("/register", photocopycenterController.register);

router.get("/generate-qr/:shopOwnerId", photocopycenterController.generateQR);

router.post("/login", userController.login);

router.post("/logout", userController.logout);

router.post("/register-user", userController.register);

router.get("/user/:id", userController.getUserById);

router.put("/update-user/:id", userController.editProfile);

module.exports = router;
