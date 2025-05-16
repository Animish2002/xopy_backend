const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdf-lib").PDFDocument;
const Joi = require("joi");
const { getIO } = require("../utils/socket");

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Helper function to calculate pricing
async function calculatePricing(jobDetails) {
  try {
    const {
      shopOwnerId,
      noofCopies,
      printType,
      paperType,
      printSide,
      totalPages,
    } = jobDetails;

    // Find the pricing config for this combination
    const pricingConfig = await prisma.pricingConfig.findFirst({
      where: {
        shopOwnerId,
        paperType,
        printType,
      },
    });

    if (!pricingConfig) {
      throw new Error(
        `No pricing configuration found for ${paperType} ${printType}`
      );
    }

    // Calculate cost based on single/double sided
    const pricePerPage =
      printSide === "DOUBLE_SIDED"
        ? pricingConfig.doubleSided
        : pricingConfig.singleSided;

    // Calculate total cost
    const totalCost = pricePerPage * totalPages * noofCopies;

    return parseFloat(totalCost.toFixed(2));
  } catch (error) {
    console.error("Error calculating pricing:", error);
    throw error;
  }
}

// Helper function to count PDF pages
async function countPDFPages(fileBuffer) {
  try {
    const pdfDoc = await PDFDocument.load(fileBuffer);
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error("Error counting PDF pages:", error);
    return 1; // Default to 1 if we can't determine
  }
}

const printJobController = {
  async createPrintJob(req, res) {
    try {
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

      const files = req.files;

      // Validation
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
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/jpeg",
        "image/png",
      ];

      // Check each file type
      for (const file of files) {
        if (!allowedFileTypes.includes(file.mimetype)) {
          return res.status(400).json({
            message: `Unsupported file type: ${file.mimetype}. Allowed types are PDF, DOC, DOCX, or images (JPEG, PNG).`,
          });
        }
      }

      // Generate unique token number
      const tokenNumber = `PJ-${Date.now()}-${Math.floor(
        Math.random() * 1000
      )}`;

      // Calculate total pages from all files
      let totalPages = 0;
      for (const file of files) {
        let filePages = 1; // Default for non-PDF files

        if (file.mimetype === "application/pdf") {
          filePages = await countPDFPages(file.buffer);
        }

        totalPages += filePages;
      }

      // Verify shop owner exists first
      const shopOwner = await prisma.user.findUnique({
        where: { id: String(shopOwnerId) },
      });

      // if (!shopOwner) {
      //   return res.status(404).json({
      //     message: "Shop owner not found. Please provide a valid shopOwnerId.",
      //   });
      // }

      // Create print job with schema-compatible fields
      const printJob = await prisma.printJob.create({
        data: {
          shopOwnerId: String(shopOwnerId),
          tokenNumber,
          // Store customer information in metadata as JSON if not in schema
          metadata: JSON.stringify({
            customerName: customerName || "",
            customerPhone: customerPhone || "",
            customerEmail: customerEmail || "",
            specificPages: specificPages || "",
          }),
          noofCopies: parseInt(noofCopies),
          printType: printType || "BLACK_WHITE",
          paperType: paperType || "A4",
          printSide: printSide || "SINGLE_SIDED",
          totalPages,
          status: "PENDING",
        },
      });

      // Calculate pricing after creation (now that we have the ID)
      const totalCost = await calculatePricing({
        shopOwnerId,
        noofCopies: parseInt(noofCopies),
        printType: printType || "BLACK_WHITE",
        paperType: paperType || "A4",
        printSide: printSide || "SINGLE_SIDED",
        totalPages,
      });

      // Update the print job with the calculated cost
      await prisma.printJob.update({
        where: { id: printJob.id },
        data: { totalCost },
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
          .createSignedUrl(fileName, 60 * 60 * 24); // 24 hour expiry

        // Calculate pages for this file
        let pages = 1;
        if (file.mimetype === "application/pdf") {
          pages = await countPDFPages(file.buffer);
        }

        const printJobFile = await prisma.printJobFile.create({
          data: {
            printJobId: printJob.id,
            fileName: file.originalname,
            fileUrl: urlData.signedUrl,
            fileType: file.mimetype,
            pages,
          },
        });

        printJobFiles.push(printJobFile);
      }

      // Extract customer info from metadata for the response
      const metadata = printJob.metadata ? JSON.parse(printJob.metadata) : {};

      // Notify shop owner of new print job via WebSocket
      getIO()
        .to(`shop_${shopOwnerId}`)
        .emit("newPrintJob", {
          id: printJob.id,
          tokenNumber: printJob.tokenNumber,
          customerName: metadata.customerName || "Anonymous",
          totalPages: printJob.totalPages,
          totalCost: printJob.totalCost,
          status: printJob.status,
          files: printJobFiles.map((file) => ({
            id: file.id,
            fileName: file.fileName,
            fileUrl: file.fileUrl,
          })),
          createdAt: printJob.createdAt,
          // Add all other necessary fields that match your frontend expectations
        });

      res.status(201).json({
        message: "Print job created successfully",
        printJob: {
          ...printJob,
          ...metadata, // Add the customer info from metadata back to the response
          totalCost,
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

      // If status is COMPLETED, update the file URLs expiration
      if (status === "COMPLETED") {
        // Set expiration for files or delete them based on your policy
        await Promise.all(
          printJob.files.map(async (file) => {
            const filePath = `shops/${printJob.shopOwnerId}/${printJob.id}_${file.fileName}`;

            // Option 1: Delete files
            // const { error: deleteError } = await supabase.storage
            //   .from("shop-uploads")
            //   .remove([filePath]);
            // if (deleteError) throw deleteError;

            // Option 2: Update URL to expire in 24 hours
            const { data: urlData, error: urlError } = await supabase.storage
              .from("shop-uploads")
              .createSignedUrl(filePath, 60 * 5); // 5 minute expiry

            if (urlError) throw urlError;

            // Update file URL in database
            await prisma.printJobFile.update({
              where: { id: file.id },
              data: { fileUrl: urlData.signedUrl },
            });
          })
        );
      }

      // Update job status
      const updatedJob = await prisma.printJob.update({
        where: { id: jobId },
        data: { status },
        include: { files: true },
      });

      // Emit WebSocket event for status update
      getIO().to(`shop_${printJob.shopOwnerId}`).emit("printJobStatusUpdate", {
        id: jobId,
        status,
        tokenNumber: printJob.tokenNumber,
      });

      // Also notify the customer room if they're tracking this job
      getIO().to(`printjob_${jobId}`).emit("printJobStatusUpdate", {
        id: jobId,
        status,
        tokenNumber: printJob.tokenNumber,
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
      const { status } = req.query; // Optional status filter

      // Build the query
      const query = {
        where: { shopOwnerId: shopId },
        orderBy: { createdAt: "desc" }, // Most recent first
      };

      // Add status filter if provided
      if (status) {
        query.where.status = status;
      }

      // Get all print jobs and associated files for this shop
      const printJobsWithFiles = await prisma.printJob.findMany({
        ...query,
        select: {
          id: true,
          tokenNumber: true,          
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
          metadata: true,
        },
      });

      // Generate signed URLs for each file and format the response
      const filesWithUrls = await Promise.all(
        printJobsWithFiles.map(async (job) => {
          const filesWithSignedUrls = await Promise.all(
            job.files.map(async (file) => {
              // Check if the URL is expired and regenerate if needed
              let fileUrl = file.fileUrl;

              // Simple check: if URL is old or empty, regenerate
              if (
                !fileUrl ||
                new Date(file.updatedAt) <
                  new Date(Date.now() - 12 * 60 * 60 * 1000)
              ) {
                const filepath = `shops/${shopId}/${job.id}_${file.fileName}`;
                const { data: urlData, error: urlError } =
                  await supabase.storage
                    .from("shop-uploads")
                    .createSignedUrl(filepath, 60 * 60 * 24); // 24 hour validity

                if (!urlError && urlData) {
                  fileUrl = urlData.signedUrl;

                  // Update the file record with new URL
                  await prisma.printJobFile.update({
                    where: { id: file.id },
                    data: { fileUrl: fileUrl },
                  });
                }
              }

              return {
                ...file,
                signedUrl: fileUrl,
              };
            })
          );

          // Format the response to match the expected structure
          return {
            ...job,
            // Flatten customer information to the expected fields
            // Remove the nested customer object if you don't need it in the response
            customer: undefined,
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

  async getJobStatusByToken(req, res) {
    try {
      const { tokenNumber } = req.params;

      const printJob = await prisma.printJob.findUnique({
        where: { tokenNumber },
        select: {
          id: true,
          tokenNumber: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          customerName: true,
          totalPages: true,
          totalCost: true,
          noofCopies: true,
          printType: true,
          paperType: true,
          printSide: true,
        },
      });

      if (!printJob) {
        return res.status(404).json({
          success: false,
          message: "Print job not found",
        });
      }

      res.status(200).json({
        success: true,
        data: printJob,
      });
    } catch (error) {
      console.error("Error fetching print job:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching print job",
        error: error.message,
      });
    }
  },

  async getPrintJobsByStatus(req, res) {
    try {
      const { shopId } = req.params;
      const { status } = req.params;

      // Validate status is a valid enum value
      const validStatuses = ["PENDING", "PROCESSING", "COMPLETED", "CANCELLED"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid status. Must be one of: PENDING, PROCESSING, COMPLETED, CANCELLED",
        });
      }

      const printJobs = await prisma.printJob.findMany({
        where: {
          shopOwnerId: shopId,
          status: status,
        },
        include: {
          files: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({
        success: true,
        count: printJobs.length,
        data: printJobs,
      });
    } catch (error) {
      console.error(`Error fetching ${status} print jobs:`, error);
      res.status(500).json({
        success: false,
        message: `Error fetching ${status} print jobs`,
        error: error.message,
      });
    }
  },
};

module.exports = printJobController;
