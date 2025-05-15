const express = require("express");
const printjobController = require("../controller/printjobController");

const router = express.Router();

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
  printjobController.createPrintJob
);

router.patch(
  "/print-jobs/:jobId/status",
  printjobController.updatePrintJobStatus
);

router.get("/shop-files/:shopId", printjobController.getFilesByShopId);

module.exports = router;
