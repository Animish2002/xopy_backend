const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const uuid = require("uuid");

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

const crypto = require('crypto');
const nodemailer = require('nodemailer'); // You'll need to install this package

const userController = {
  
  async register(req, res) {
    try {
      const { email, name, address, phoneNumber, password, role = "CUSTOMER" } = req.body;

      if (!prisma.user) {
        return res.status(500).json({
          message: "Database client not properly initialized",
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({
          message: "User with this email already exists",
        });
      }
      
      if (!email || !name || !phoneNumber || !password) {
        return res.status(400).json({
          message: "Required fields (email, name, phoneNumber, password) are missing",
        });
      }

      // Validate role is one of the enumerated values
      if (!["CUSTOMER", "ADMIN"].includes(role)) {
        return res.status(400).json({
          message: "Invalid role specified",
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      
      // Generate verification token for email verification
      const verificationToken = uuid.v4();

      // Create user transaction to handle both user and related shop owner creation
      const userData = await prisma.$transaction(async (prisma) => {
        // Create the base user
        const user = await prisma.user.create({
          data: {
            id: uuid.v4(),
            email,
            name,
            address,
            phoneNumber,
            passwordHash,
            role,
            // For ADMIN role, auto-verify if it's a system admin
            isVerified: role === "ADMIN" ? true : false,
            // Store verification token (in real app, might store in separate table)
            // This is a placeholder - you would add this field to your schema
            // verificationToken: verificationToken,
          },
          select: {
            id: true,
            name: true,
            email: true,
            address: true,
            phoneNumber: true,
            isVerified: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return user;
      });

      // Here you would send verification email with token
      // sendVerificationEmail(email, verificationToken);
      
      res.status(201).json({
        message: "User registered successfully. Please verify your email to activate your account.",
        user: userData,
      });
    } catch (error) {
      console.error("User creation error:", error);
      res.status(500).json({
        message: "Error registering user",
        error: error.message,
        // Include stack trace for debugging
        stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
      });
    }
  },

  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          shopOwnerInfo: true, // Include shop owner info if applicable
        },
      });

      if (!user) {
        return res.status(401).json({
          message: "Invalid email",
        });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          message: "Invalid password",
        });
      }
      
      // Check if user is verified
      // if (!user.isVerified) {
      //   return res.status(403).json({
      //     message: "Account not verified. Please check your email for verification instructions.",
      //     needsVerification: true,
      //     userId: user.id
      //   });
      // }

      // Prepare token data depending on role
      const tokenData = {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        isVerified: user.isVerified
      };

      // Add shop info to token if user is a shop owner
      if (user.role === "SHOP_OWNER" && user.shopOwnerInfo) {
        tokenData.shopOwnerId = user.shopOwnerInfo.id;
        tokenData.shopName = user.shopOwnerInfo.shopName;
      }

      const token = jwt.sign(tokenData, JWT_SECRET, {
        expiresIn: "12h",
      });
      
      res.cookie("token", token, { httpOnly: true });
      res.status(200).json({
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isVerified: user.isVerified,
          ...(user.role === "SHOP_OWNER" && user.shopOwnerInfo ? {
            shopOwnerId: user.shopOwnerInfo.id,
            shopName: user.shopOwnerInfo.shopName
          } : {})
        },
      });
    } catch (error) {
      res.status(500).json({
        message: "Login error",
        error: error.message,
      });
    }
  },

  async logout(req, res) {
    try {
      res.clearCookie("token");
      res.status(200).json({
        message: "Logout successful",
      });
    } catch (error) {
      res.status(500).json({
        message: "Logout error",
        error: error.message,
      });
    }
  },

  async changePassword(req, res) {
    try {
      const { id: userId } = req.user;

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized, missing userId" });
      }

      const { currentPassword, newPassword } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.passwordHash
      );
      if (!isPasswordValid) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashedNewPassword },
      });

      res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
      res.status(500).json({
        message: "Error changing password",
        error: error.message,
      });
    }
  },

  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Get the user to check their role
      const user = await prisma.user.findUnique({
        where: { id },
        include: { shopOwnerInfo: true }
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
            where: { shopOwnerId: user.shopOwnerInfo.id }
          });
          
          // Handle print jobs - for a real application, this might need more handling
          // Options: reassign to another shop, mark as cancelled, etc.
          // For now, we'll prevent deletion if there are active print jobs
          const activeJobs = await prisma.printJob.count({
            where: { 
              shopOwnerId: user.shopOwnerInfo.id,
              status: { notIn: ["COMPLETED", "CANCELLED"] }
            }
          });
          
          if (activeJobs > 0) {
            throw new Error("Cannot delete user with active print jobs");
          }
          
          // Delete shop owner record
          await prisma.shopOwner.delete({
            where: { id: user.shopOwnerInfo.id }
          });
        }
        
        // Delete the user
        await prisma.user.delete({
          where: { id }
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

  // Admin specific functions
  async getAllUsers(req, res) {
    try {
      // Check if the requesting user is an admin
      if (req.user.role !== "ADMIN") {
        return res.status(403).json({
          message: "Access denied. Admin privileges required.",
        });
      }

      const users = await prisma.user.findMany({
        include: {
          shopOwnerInfo: true,
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.status(200).json({
        users: users.map(user => ({
          ...user,
          passwordHash: undefined // Don't expose password hashes
        }))
      });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching users",
        error: error.message
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
        message: `User ${isVerified ? 'verified' : 'unverified'} successfully`,
        user: {
          ...updatedUser,
          passwordHash: undefined
        }
      });
    } catch (error) {
      res.status(500).json({
        message: "Error updating user status",
        error: error.message
      });
    }
  },

  // Shop owner specific functions
  async getShopDetails(req, res) {
    try {
      const { id } = req.user;
      
      // Ensure user is a shop owner
      const shopOwner = await prisma.user.findUnique({
        where: { id },
        include: {
          shopOwnerInfo: {
            include: {
              pricingConfig: true
            }
          }
        }
      });

      if (!shopOwner || shopOwner.role !== "SHOP_OWNER") {
        return res.status(403).json({
          message: "Access denied. Shop owner privileges required.",
        });
      }

      res.status(200).json({
        shop: {
          ...shopOwner.shopOwnerInfo,
          user: {
            name: shopOwner.name,
            email: shopOwner.email,
            phoneNumber: shopOwner.phoneNumber,
            address: shopOwner.address
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching shop details",
        error: error.message
      });
    }
  },

  async updateShopDetails(req, res) {
    try {
      const { id } = req.user;
      const { shopName, address, phoneNumber } = req.body;
      
      // Ensure user is a shop owner
      const user = await prisma.user.findUnique({
        where: { id },
        include: { shopOwnerInfo: true }
      });

      if (!user || user.role !== "SHOP_OWNER" || !user.shopOwnerInfo) {
        return res.status(403).json({
          message: "Access denied. Shop owner privileges required.",
        });
      }

      // Update both user and shop owner details
      await prisma.$transaction(async (prisma) => {
        // Update user details
        await prisma.user.update({
          where: { id },
          data: {
            address: address !== undefined ? address : user.address,
            phoneNumber: phoneNumber !== undefined ? phoneNumber : user.phoneNumber
          }
        });

        // Update shop details
        if (shopName !== undefined) {
          await prisma.shopOwner.update({
            where: { id: user.shopOwnerInfo.id },
            data: { shopName }
          });
        }
      });

      // Get updated data to return
      const updatedUser = await prisma.user.findUnique({
        where: { id },
        include: { shopOwnerInfo: true }
      });

      res.status(200).json({
        message: "Shop details updated successfully",
        shop: {
          ...updatedUser.shopOwnerInfo,
          user: {
            name: updatedUser.name,
            email: updatedUser.email,
            phoneNumber: updatedUser.phoneNumber,
            address: updatedUser.address
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        message: "Error updating shop details",
        error: error.message
      });
    }
  },
  
  // User verification endpoints
  async sendVerificationEmail(req, res) {
    try {
      const { email } = req.body;
      
      const user = await prisma.user.findUnique({
        where: { email }
      });
      
      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }
      
      if (user.isVerified) {
        return res.status(400).json({
          message: "User is already verified"
        });
      }
      
      // Generate verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Store token with expiry (24 hours)
      // In a real implementation, you would add this to your schema
      // For now, we'll simulate by updating a user record
      // This is a placeholder - add a proper verification token table in your schema
      
      // In a production app, store this in your database
      // await prisma.verificationToken.create({
      //   data: {
      //     token: verificationToken,
      //     userId: user.id,
      //     expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      //   }
      // });
      
      // Send email
      // This is a placeholder - replace with your actual email sending logic
      const verificationUrl = `${process.env.FRONTEND_URL}/verify?token=${verificationToken}&userId=${user.id}`;
      
      // Example email sending logic (using nodemailer)
      // const transporter = nodemailer.createTransport({
      //   service: 'gmail',
      //   auth: {
      //     user: process.env.EMAIL_USER,
      //     pass: process.env.EMAIL_PASS
      //   }
      // });
      
      // const mailOptions = {
      //   from: process.env.EMAIL_USER,
      //   to: email,
      //   subject: 'Verify Your Account',
      //   html: `
      //     <h1>Account Verification</h1>
      //     <p>Please click the link below to verify your account:</p>
      //     <a href="${verificationUrl}">Verify Account</a>
      //     <p>This link will expire in 24 hours.</p>
      //   `
      // };
      
      // await transporter.sendMail(mailOptions);
      
      // For development purposes, return the verification URL
      res.status(200).json({
        message: "Verification email sent",
        devNote: "In production, remove the token from response",
        verificationUrl  // Remove this in production
      });
    } catch (error) {
      res.status(500).json({
        message: "Error sending verification email",
        error: error.message
      });
    }
  },
  
  async verifyUser(req, res) {
    try {
      const { token, userId } = req.query;
      
      if (!token || !userId) {
        return res.status(400).json({
          message: "Missing token or userId"
        });
      }
      
      // In a real app, you would validate the token against your database
      // const verificationRecord = await prisma.verificationToken.findFirst({
      //   where: {
      //     token,
      //     userId,
      //     expires: {
      //       gt: new Date()
      //     }
      //   }
      // });
      
      // if (!verificationRecord) {
      //   return res.status(400).json({
      //     message: "Invalid or expired verification token"
      //   });
      // }
      
      // Update user to verified status
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { isVerified: true }
      });
      
      // Delete the verification token after use
      // await prisma.verificationToken.delete({
      //   where: { id: verificationRecord.id }
      // });
      
      res.status(200).json({
        message: "Account verified successfully",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          isVerified: updatedUser.isVerified
        }
      });
    } catch (error) {
      res.status(500).json({
        message: "Error verifying user",
        error: error.message
      });
    }
  },
  
  async resendVerification(req, res) {
    try {
      const { userId } = req.body;
      
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }
      
      if (user.isVerified) {
        return res.status(400).json({
          message: "User is already verified"
        });
      }
      
      // Delete any existing verification tokens
      // await prisma.verificationToken.deleteMany({
      //   where: { userId }
      // });
      
      // Generate and store new token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      
      // Store token with expiry (24 hours)
      // await prisma.verificationToken.create({
      //   data: {
      //     token: verificationToken,
      //     userId: user.id,
      //     expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      //   }
      // });
      
      // Send email (similar to sendVerificationEmail method)
      const verificationUrl = `${process.env.FRONTEND_URL}/verify?token=${verificationToken}&userId=${user.id}`;
      
      // For development purposes, return the verification URL
      res.status(200).json({
        message: "Verification email resent",
        devNote: "In production, remove the token from response",
        verificationUrl // Remove this in production
      });
    } catch (error) {
      res.status(500).json({
        message: "Error resending verification",
        error: error.message
      });
    }
  },

  // Manual verification for admins
  async manualVerifyUser(req, res) {
    try {
      const { userId } = req.params;
      
      // Check if requester is admin
      if (req.user.role !== "ADMIN") {
        return res.status(403).json({
          message: "Access denied. Admin privileges required."
        });
      }
      
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        return res.status(404).json({
          message: "User not found"
        });
      }
      
      // Update verification status
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { isVerified: true }
      });
      
      res.status(200).json({
        message: "User verified successfully by admin",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          isVerified: updatedUser.isVerified
        }
      });
    } catch (error) {
      res.status(500).json({
        message: "Error verifying user",
        error: error.message
      });
    }
  }
};

module.exports = userController;