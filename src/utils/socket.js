const socket = require("socket.io");

let io; // Global IO instance

const initializeSocket = (server) => {
  io = socket(server, {
    cors: {
      origin: "*",
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join a room specific to the shop owner
    socket.on("joinShopRoom", (shopOwnerId) => {
      console.log(`Socket ${socket.id} joining shop room: ${shopOwnerId}`);
      socket.join(`shop_${shopOwnerId}`);
    });

    // Join a room for specific print job (for customer tracking)
    socket.on("joinPrintJobRoom", (printJobId) => {
      console.log(`Socket ${socket.id} joining print job room: ${printJobId}`);
      socket.join(`printjob_${printJobId}`);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

// Getter function to access the io instance
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

module.exports = {
  initializeSocket,
  getIO
};