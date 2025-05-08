const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const uuid = require("uuid");

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

const userController = {
  
  async register(req, res) {
    try {
      const { email, name, address, phone, password, shopName } = req.body;
      const role = "ShopOwner";

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
      if (!email || !name || !address || !phone || !password) {
        return res.status(400).json({
          message:
            "All fields (email, name, address, phone, password, shopName ) are required",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          id: uuid.v4(),
          email,
          name,
          address,
          phone,
          shopName,
          password: hashedPassword,
          role,
        },
        select: {
          id: true,
          name: true,
          email: true,
          address: true,
          phone: true,
          status: true,
          updatedAt: true,
          role: true,
          createdAt: true,
        },
      });
      res.status(201).json({
        message: "User registered successfully",
        user,
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
      const user = await prisma.shopOwner.findUnique({
        where: { email },
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

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          shopeName: user.shopeName,
        },
        JWT_SECRET,
        {
          expiresIn: "12h",
        }
      );
      res.cookie("token", token, { httpOnly: true });
      res.status(200).json({
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
      localStorage.removeItem("token");
      localStorage.removeItem("role");
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
        user.password
      );
      if (!isPasswordValid) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
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

      await prisma.user.delete({
        where: { id: parseInt(id) },
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
};

module.exports = userController;
