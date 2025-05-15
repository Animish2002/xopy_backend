const bcrypt = require("bcrypt");
const uuid = require("uuid");
const { PrismaClient } = require("@prisma/client");
const qr = require("qrcode"); // Import the qrcode library
const supabase = require("../utils/supabaseClient");
const Joi = require("joi");

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

const photocopycenterController = {
  async register(req, res) {
    try {
      const { name, email, shopName, phoneNumber, address, passwordHash } =
        req.body;

      if (!name || !email || !phoneNumber || !shopName || !passwordHash) {
        return res.status(400).json({
          message:
            "All fields (name, email, phone, shopName, password) are required",
        });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "User with this email already exists",
        });
      }

      // Check if phone number is already in use
      const existingPhoneNumber = await prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (existingPhoneNumber) {
        return res.status(400).json({
          message: "User with this phone number already exists",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(passwordHash, 10);

      // Generate 8-character unique ID for user
      const shortId = uuid.v4().substring(0, 8);

      // Use a transaction to create both User and ShopOwner
      const result = await prisma.$transaction(async (prisma) => {
        // First create the User
        const user = await prisma.user.create({
          data: {
            id: shortId,
            name,
            email,
            phoneNumber,
            address,
            passwordHash: hashedPassword,
            role: "SHOP_OWNER", // Use enum value from schema
          },
        });

        // Then create the ShopOwner with reference to the User
        const shopOwner = await prisma.shopOwner.create({
          data: {
            userId: user.id,
            shopName,
            // qrCodeUrl will be added after generation
          },
        });

        return { user, shopOwner };
      });

      // Create a dedicated folder for the shop
      const shopFolder = `shops/${result.shopOwner.id}/`;
      const { error: storageError } = await supabase.storage
        .from("shop-uploads")
        .upload(`${shopFolder}.folder`, Buffer.from("")); // Create empty folder marker

      if (storageError) {
        return res.status(500).json({
          message: "Error creating shop folder",
          error: storageError.message,
        });
      }

      // Generate portal URL with shop owner ID
      const portalUrl = `${process.env.FRONTEND_URL}/preferences/${result.shopOwner.id}`;

      // Generate QR code with portal URL
      const qrCodeUrl = await qr.toDataURL(portalUrl);

      // Update shopOwner with QR code URL
      const updatedShopOwner = await prisma.shopOwner.update({
        where: { id: result.shopOwner.id },
        data: {
          qrCodeUrl,
        },
        include: {
          user: true, // Include user data in the response
        },
      });

      res.status(201).json({
        message: "Shop owner registered successfully",
        shopOwner: updatedShopOwner,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        message: "Error creating shop owner",
        error: error.message,
      });
    }
  },

  async generateQR(req, res) {
    try {
      const { shopOwnerId } = req.params;
      const shopOwner = await prisma.shopOwner.findUnique({
        where: { id: shopOwnerId },
        select: { qrCodeUrl: true },
      });
      if (!shopOwner) {
        return res.status(404).json({ message: "Shop owner not found" });
      }

      const qrCodeUrl = shopOwner.qrCodeUrl;

      res.status(200).json({ qrCodeUrl });
    } catch (error) {
      res.status(500).json({
        message: "Error generating QR code",
        error: error.message,
      });
    }
  },
};

module.exports = photocopycenterController;
