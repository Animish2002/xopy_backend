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

router.get("/shop-files/:shopId", photocopycenterController.getFilesByShopId);

router.post("/pricing-config", photocopycenterController.pricingConfig);
router.get(
  "/pricing-configById/:id",
  photocopycenterController.getPricingConfigbyId
);
router.put(
  "/edit-pricing-config/:id",
  photocopycenterController.editPricingConfig
);
router.delete(
  "/delete-pricing-config/:id",
  photocopycenterController.deletPricingConfig
);

router.get(
  "/pricing-config/:shopOwnerId",
  photocopycenterController.getPricingConfig
);

router.get("/generate-qr/:shopOwnerId", photocopycenterController.generateQR);

router.post("/login", userController.login);

router.post("/logout", userController.logout);

router.post("/register-user", userController.register);

module.exports = router;
