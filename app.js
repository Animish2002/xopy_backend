const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const userRoutes = require("./src/routes/userRoutes");

app.use("/api/auth", userRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
