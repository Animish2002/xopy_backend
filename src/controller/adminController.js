const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const uuid = require("uuid");

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

const crypto = require("crypto");
const nodemailer = require("nodemailer");

const adminController = {
  // Admin specific functions
  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Get the user to check their role
      const user = await prisma.user.findUnique({
        where: { id },
        include: { shopOwnerInfo: true },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Using a transaction to ensure all related records are deleted properly
      await prisma.$transaction(async (prisma) => {
        // If shop owner, delete shop owner record first
        if (user.role === "SHOP_OWNER" && user.shopOwnerInfo) {
          // Delete pricing configurations
          await prisma.pricingConfig.deleteMany({
            where: { shopOwnerId: user.shopOwnerInfo.id },
          });

          // Handle print jobs - for a real application, this might need more handling
          // Options: reassign to another shop, mark as cancelled, etc.
          // For now, we'll prevent deletion if there are active print jobs
          const activeJobs = await prisma.printJob.count({
            where: {
              shopOwnerId: user.shopOwnerInfo.id,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
          });

          if (activeJobs > 0) {
            throw new Error("Cannot delete user with active print jobs");
          }

          // Delete shop owner record
          await prisma.shopOwner.delete({
            where: { id: user.shopOwnerInfo.id },
          });
        }

        // Delete the user
        await prisma.user.delete({
          where: { id },
        });
      });

      res.status(200).json({
        message: "User deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        message: "Error deleting user",
        error: error.message,
      });
    }
  },

  async getAllUsers(req, res) {
    try {
      const users = await prisma.user.findMany({
        include: {
          shopOwnerInfo: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.status(200).json({
        users: users.map((user) => ({
          ...user,
          passwordHash: undefined, // Don't expose password hashes
        })),
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({
        message: "Error fetching users",
        error: error.message,
      });
    }
  },

  async toggleUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { isVerified } = req.body;

      // Check if the requesting user is an admin
      if (req.user.role !== "ADMIN") {
        return res.status(403).json({
          message: "Access denied. Admin privileges required.",
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: { isVerified },
      });

      res.status(200).json({
        message: `User ${isVerified ? "verified" : "unverified"} successfully`,
        user: {
          ...updatedUser,
          passwordHash: undefined,
        },
      });
    } catch (error) {
      res.status(500).json({
        message: "Error updating user status",
        error: error.message,
      });
    }
  },
};

module.exports = adminController;
