const express = require("express");
const photocopycenterController = require("../controller/photocopycenterAuth");

const router = express.Router();

router.post("/register", photocopycenterController.register);

router.get("/users", photocopycenterController.getAllUser);
const multer = require("multer");
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

module.exports = router;
