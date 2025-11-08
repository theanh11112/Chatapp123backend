// socket/index.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const chatEvents = require("./events/chat");
const callEvents = require("./events/call");
const User = require("../models/user");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Middleware xác thực token
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.decode(token);
      socket.user = decoded; // gán thông tin user vào socket
      next();
    } catch (err) {
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const user_id = socket.user?.sub || socket.handshake.query["user_id"];
    console.log(`🔌 User connected: ${user_id} (${socket.id})`);

    if (user_id) {
      await User.findByIdAndUpdate(user_id, { socket_id: socket.id, status: "Online" });
    }

    // Import các event handlers
    chatEvents(socket, io);
    callEvents(socket, io);

    // Xử lý disconnect
    socket.on("disconnect", async () => {
      if (user_id) await User.findByIdAndUpdate(user_id, { status: "Offline" });
      console.log(`❌ User disconnected: ${user_id}`);
    });
  });

  return io;
};

module.exports = initSocket;
