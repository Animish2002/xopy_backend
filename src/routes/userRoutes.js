const express = require("express");
const photocopycenterController = require("../controller/photocopycenterAuth");

const router = express.Router();

router.post("/register", photocopycenterController.register);

router.get("/users", photocopycenterController.getAllUser);
const multer = require("multer");
const userController = require("../controller/UserAuth");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Update your route to use multer
router.post(
  "/print-jobs",
  upload.array("files"),
  photocopycenterController.createPrintJob
);

router.patch(
  "/print-jobs/:jobId/status",
  photocopycenterController.updatePrintJobStatus
);

router.get("/shop-files/:shopId", photocopycenterController.getShopFiles);

router.post("/pricing-config", photocopycenterController.pricingConfig);

router.get(
  "/pricing-config/:shopOwnerId",
  photocopycenterController.getPricingConfig
);

router.get("/generate-qr/:shopOwnerId", photocopycenterController.generateQR);

router.post("/login", userController.login);

router.post("/logout", userController.logout);

module.exports = router;
