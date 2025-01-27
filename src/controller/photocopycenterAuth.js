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
          message: "All fields (name, email, phone, address) are required",
        });
      }

      // Check if user already exists
      const existingUser = await prisma.shopOwner.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "User with this email already exists",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(passwordHash, 10);

      // Generate 8-character unique ID
      const shortId = uuid.v4().substring(0, 8);

      // Create a new user with role explicitly set and short ID
      const user = await prisma.shopOwner.create({
        data: {
          id: shortId,
          name,
          email,
          shopName,
          phoneNumber,
          address,
          passwordHash: hashedPassword,
          role: "ShopOwner",
        },
      });

      // Create a dedicated folder for the shop
      const shopFolder = `shops/${user.id}/`;
      const { error: storageError } = await supabase.storage
        .from("shop-uploads")
        .upload(`${shopFolder}.folder`, Buffer.from("")); // Create empty folder marker

      if (storageError) {
        return res.status(500).json({
          message: "Error creating shop folder",
          error: storageError.message,
        });
      }

      // Generate portal URL with shop folder path
      const portalUrl = `${process.env.FRONTEND_URL}/preferences/${user.id}`;

      // Generate QR code with portal URL
      const qrCodeUrl = await qr.toDataURL(portalUrl);

      // Update user with QR code URL
      const updatedUser = await prisma.shopOwner.update({
        where: { id: user.id },
        data: {
          qrCodeUrl,
        },
      });

      res.status(201).json({
        message: "Shop owner registered successfully",
        user: updatedUser,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error creating user",
        error: error.message,
      });
    }
  },

  async createPrintJob(req, res) {
    try {
      // Add these console logs at the start of the function
      console.log("Request body:", req.body);
      console.log("Request files:", req.files);
      const {
        shopOwnerId,
        customerName,
        customerPhone,
        customerEmail,
        noofCopies,
        printType,
        paperType,
        printSide,
        specificPages,
      } = req.body;
      // Clean the shopOwnerId by removing any whitespace

      const files = req.files;

      // Validation with trimmed values
      if (!shopOwnerId) {
        return res.status(400).json({
          message: "shopOwnerId is required",
        });
      }

      if (!noofCopies) {
        return res.status(400).json({
          message: "noofCopies is required",
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          message: "At least one file is required",
        });
      }

      // Allowed MIME types
      const allowedFileTypes = [
        "application/pdf", // PDF
        "application/msword", // DOC
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
        "image/jpeg", // JPG
        "image/png", // PNG
      ];
      // Check each file type
      for (const file of files) {
        if (!allowedFileTypes.includes(file.mimetype)) {
          return res.status(400).json({
            message: `Unsupported file type: ${file.mimetype}. Allowed types are PDF, DOC, DOCX, or images (JPEG, PNG, GIF).`,
          });
        }
      }
      // Generate unique token number
      const tokenNumber = `PJ-${Date.now()}-${Math.floor(
        Math.random() * 1000
      )}`;

      // Create print job with proper type conversion
      const printJob = await prisma.printJob.create({
        data: {
          shopOwnerId: String(shopOwnerId),
          tokenNumber,
          customerName: String(customerName || ""),
          customerPhone: String(customerPhone || ""),
          customerEmail: String(customerEmail || ""),
          noofCopies: parseInt(noofCopies),
          printType: printType || "BLACK_WHITE",
          paperType: paperType || "A4",
          printSide: printSide || "SINGLE_SIDED",
          specificPages: String(specificPages || ""),
          status: "PENDING",
        },
      });

      // Handle file uploads
      const printJobFiles = [];
      for (const file of files) {
        const fileName = `shops/${shopOwnerId}/${printJob.id}_${file.originalname}`;

        // Upload file to Supabase
        const { error: uploadError } = await supabase.storage
          .from("shop-uploads")
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
          });

        if (uploadError) throw uploadError;

        // Get file URL
        const { data: urlData } = await supabase.storage
          .from("shop-uploads")
          .createSignedUrl(fileName, 60 * 60); // 1 hour expiry

        const printJobFile = await prisma.printJobFile.create({
          data: {
            printJobId: printJob.id,
            fileName: file.originalname,
            fileUrl: urlData.signedUrl,
            fileType: file.mimetype,
            pages: 1, // You might want to calculate this based on the file
          },
        });

        printJobFiles.push(printJobFile);
      }

      res.status(201).json({
        message: "Print job created successfully",
        printJob: {
          ...printJob,
          files: printJobFiles,
        },
      });
    } catch (error) {
      console.error("Print job creation error:", error);
      res.status(500).json({
        message: "Error creating print job",
        error: error.message,
      });
    }
  },

  async updatePrintJobStatus(req, res) {
    try {
      const { jobId } = req.params;
      const { status } = req.body;

      const printJob = await prisma.printJob.findUnique({
        where: { id: jobId },
        include: { files: true },
      });

      if (!printJob) {
        return res.status(404).json({
          message: "Print job not found",
        });
      }

      // If status is COMPLETED, delete the files
      if (status === "COMPLETED") {
        // Delete files from storage
        await Promise.all(
          printJob.files.map(async (file) => {
            const filePath = `shops/${printJob.shopOwnerId}/${printJob.id}_${file.fileName}`;
            const { error: deleteError } = await supabase.storage
              .from("shop-uploads")
              .remove([filePath]);

            if (deleteError) throw deleteError;
          })
        );
      }

      // Update job status
      const updatedJob = await prisma.printJob.update({
        where: { id: jobId },
        data: { status },
        include: { files: true },
      });

      res.status(200).json({
        message: "Print job status updated successfully",
        printJob: updatedJob,
      });
    } catch (error) {
      res.status(500).json({
        message: "Error updating print job status",
        error: error.message,
      });
    }
  },

  async getFilesByShopId(req, res) {
    try {
      const { shopId } = req.params;

      // First get files from Supabase storage
      const { data: storageFiles, error: storageError } = await supabase.storage
        .from("shop-uploads")
        .list(`shops/${shopId}`);

      if (storageError) throw storageError;

      // Get all print jobs and associated files for this shop
      const printJobsWithFiles = await prisma.printJob.findMany({
        where: {
          shopOwnerId: shopId,
        },
        select: {
          id: true,
          tokenNumber: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          noofCopies: true,
          printType: true,
          paperType: true,
          printSide: true,
          specificPages: true,
          totalPages: true,
          totalCost: true,
          status: true,
          createdAt: true,
          files: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              fileType: true,
              pages: true,
              createdAt: true,
            },
          },
        },
      });

      // Generate signed URLs for each file
      const filesWithUrls = await Promise.all(
        printJobsWithFiles.map(async (job) => {
          const filesWithSignedUrls = await Promise.all(
            job.files.map(async (file) => {
              const {
                data: { publicUrl },
              } = supabase.storage
                .from("shop-uploads")
                .getPublicUrl(`shops/${shopId}/${file.fileName}`);

              return {
                ...file,
                signedUrl: publicUrl,
              };
            })
          );

          return {
            ...job,
            files: filesWithSignedUrls,
          };
        })
      );

      res.status(200).json({
        success: true,
        data: filesWithUrls,
      });
    } catch (error) {
      console.error("Error fetching shop files:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching shop files",
        error: error.message,
      });
    }
  },

  async pricingConfig(req, res) {
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
        shopOwnerId: Joi.string()
          .regex(/^[0-9a-fA-F]{8}$/)
          .required(),
      });

      const { error, value } = pricingConfigSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }

      const { paperType, printType, singleSided, doubleSided, shopOwnerId } =
        value;

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
          message: `Pricing configuration for ${paperType} (${printType}) already exists.`,
        });
      }

      // Create new pricing configuration
      const pricingConfig = await prisma.pricingConfig.create({
        data: {
          paperType,
          printType,
          singleSided,
          doubleSided,
          shopOwnerId,
        },
      });

      res.status(201).json({ pricingConfig });
    } catch (error) {
      res.status(500).json({
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

  async getAllUser(req, res) {
    try {
      const users = await prisma.shopOwner.findMany();
      res.status(200).json({ users });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error fetching users", error: error.message });
    }
  },
};

module.exports = photocopycenterController;
