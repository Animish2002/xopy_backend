const express = require("express");
const cors = require("cors");
require("dotenv").config();
const http = require("http");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// Routes
const userRoutes = require("./src/routes/userRoutes");
const pricingRoutes = require("./src/routes/pricingRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const printRoutes = require("./src/routes/printRoutes");
const { initializeSocket } = require("./src/utils/socket");

const server = http.createServer(app);
// Initialize socket and store the returned io instance
initializeSocket(server);

app.use("/api/auth", userRoutes);
app.use("/api/photocopycenter", pricingRoutes);
app.use("/api/printshop", printRoutes);
app.use("/api/admin", adminRoutes);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/ping", (req, res) => {
  res.status(200).send("Server is awake");
});
