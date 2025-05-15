const Joi = require("joi");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const pricingConfigController = {
  async addpricingConfig(req, res) {
    try {
      // Validate input
      const pricingConfigSchema = Joi.object({
        paperType: Joi.string()
          .valid(
            "A0",
            "A1",
            "A2",
            "A3",
            "A4",
            "A5",
            "LEGAL",
            "LETTER",
            "TABLOID"
          )
          .required(),
        printType: Joi.string().valid("COLOR", "BLACK_WHITE").required(),
        singleSided: Joi.number().positive().required(),
        doubleSided: Joi.number().positive().required(),
        shopOwnerId: Joi.string().guid({ version: "uuidv4" }).required(),
      });

      const { error, value } = pricingConfigSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { paperType, printType, singleSided, doubleSided, shopOwnerId } =
        value;

      // Verify shop owner exists
      const shopOwner = await prisma.shopOwner.findUnique({
        where: {
          id: shopOwnerId,
        },
      });

      if (!shopOwner) {
        return res.status(404).json({
          success: false,
          message: "Shop owner not found",
        });
      }

      // Check if the combination already exists for the shop owner
      const existingConfig = await prisma.pricingConfig.findFirst({
        where: {
          shopOwnerId,
          paperType,
          printType,
        },
      });

      if (existingConfig) {
        return res.status(400).json({
          success: false,
          message: `Pricing configuration for ${paperType} (${printType}) already exists.`,
        });
      }

      // Create new pricing configuration
      const pricingConfig = await prisma.pricingConfig.create({
        data: {
          paperType,
          printType,
          singleSided: parseFloat(singleSided),
          doubleSided: parseFloat(doubleSided),
          shopOwnerId,
        },
      });

      // Get all pricing configurations for this shop owner to return
      const allConfigs = await prisma.pricingConfig.findMany({
        where: {
          shopOwnerId,
        },
        orderBy: [{ paperType: "asc" }, { printType: "asc" }],
      });

      res.status(201).json({
        success: true,
        message: "Pricing configuration created successfully",
        pricingConfig,
        allConfigurations: allConfigs,
      });
    } catch (error) {
      console.error("Pricing configuration error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating pricing configuration",
        error: error.message,
      });
    }
  },

  async getPricingConfig(req, res) {
    try {
      const { shopOwnerId } = req.params;
      const pricingConfig = await prisma.pricingConfig.findMany({
        where: { shopOwnerId },
      });
      res.status(200).json({ pricingConfig });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching pricing configuration",
        error: error.message,
      });
    }
  },

  async getPricingConfigbyId(req, res) {
    try {
      const { id } = req.params;
      const pricingConfig = await prisma.pricingConfig.findUnique({
        where: { id },
      });
      res.status(200).json({ pricingConfig });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching pricing configuration",
        error: error.message,
      });
    }
  },

  async editPricingConfig(req, res) {
    try {
      // Validate input
      const pricingConfigSchema = Joi.object({
        id: Joi.string().guid({ version: "uuidv4" }).required(),
        paperType: Joi.string()
          .valid(
            "A0",
            "A1",
            "A2",
            "A3",
            "A4",
            "A5",
            "LEGAL",
            "LETTER",
            "TABLOID"
          )
          .required(),
        printType: Joi.string().valid("COLOR", "BLACK_WHITE").required(),
        singleSided: Joi.number().positive().required(),
        doubleSided: Joi.number().positive().required(),
        // Remove shopOwnerId from the validation if it's not meant to be in the request body
      });

      const { error, value } = pricingConfigSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message,
        });
      }

      const { id, paperType, printType, singleSided, doubleSided } = value;

      // Check if pricing config exists
      const existingConfig = await prisma.pricingConfig.findUnique({
        where: { id },
      });

      if (!existingConfig) {
        return res.status(404).json({
          success: false,
          message: "Pricing configuration not found",
        });
      }

      // Check if the updated configuration would create a duplicate
      const potentialDuplicate = await prisma.pricingConfig.findFirst({
        where: {
          id: { not: id },
          shopOwnerId: existingConfig.shopOwnerId,
          paperType,
          printType,
        },
      });

      if (potentialDuplicate) {
        return res.status(400).json({
          success: false,
          message: `Pricing configuration for ${paperType} (${printType}) already exists.`,
        });
      }

      // Update pricing configuration
      const updatedConfig = await prisma.pricingConfig.update({
        where: { id },
        data: {
          paperType,
          printType,
          singleSided: parseFloat(singleSided),
          doubleSided: parseFloat(doubleSided),
          // We're not updating shopOwnerId here
        },
      });

      // Get all pricing configurations for this shop owner to return
      const allConfigs = await prisma.pricingConfig.findMany({
        where: {
          shopOwnerId: existingConfig.shopOwnerId,
        },
        orderBy: [{ paperType: "asc" }, { printType: "asc" }],
      });

      res.status(200).json({
        success: true,
        message: "Pricing configuration updated successfully",
        pricingConfig: updatedConfig,
        allConfigurations: allConfigs,
      });
    } catch (error) {
      console.error("Pricing configuration error:", error);
      res.status(500).json({
        success: false,
        message: "Error editing pricing configuration",
        error: error.message,
      });
    }
  },

  async deletPricingConfig(req, res) {
    try {
      const { id } = req.params;
      const deletedConfig = await prisma.pricingConfig.delete({
        where: { id },
      });
      res.status(200).json({ deletedConfig });
    } catch (error) {
      res.status(500).json({
        message: "Error deleting pricing configuration",
        error: error.message,
      });
    }
  },
};

module.exports = pricingConfigController;
