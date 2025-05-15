const express = require("express");
const pricingConfigController = require("../controller/pricingConfigController");


const router = express.Router();

router.post("/pricing-config", pricingConfigController.addpricingConfig);

router.get(
  "/pricing-configById/:id",
  pricingConfigController.getPricingConfigbyId
);

router.put(
  "/edit-pricing-config/:id",
  pricingConfigController.editPricingConfig
);

router.delete(
  "/delete-pricing-config/:id",
  pricingConfigController.deletPricingConfig
);

router.get(
  "/pricing-config/:shopOwnerId",
  pricingConfigController.getPricingConfig
);

module.exports = router;
