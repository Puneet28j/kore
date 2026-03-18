
const { Server } = require("socket.io");

let io;

const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust this for production
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("🔌 New client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("🔌 Client disconnected:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

const emitOrderUpdate = (order) => {
  if (io) {
    io.emit("orderUpdated", {
      orderId: order.id || order._id,
      status: order.status,
      distributorId: order.distributorId
    });
  }
};

module.exports = { init, getIO, emitOrderUpdate };
