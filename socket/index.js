// initSocket.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const chatEvents = require("./events/chat");
const callEvents = require("./events/call");
const AuditLog = require("../models/auditLog");
const { syncUserFromToken } = require("../utils/auth");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // Middleware xác thực token và sync user async
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));

    try {
      const decoded = jwt.decode(token); // chỉ decode, không verify
      if (!decoded) return next(new Error("Invalid token"));

      // Đồng bộ user với DB
      const user = await syncUserFromToken(decoded, {
        defaultStatus: "Online",
      });

      // Cập nhật socketId và trạng thái
      user.socketId = socket.id;
      user.status = "Online";
      user.lastSeen = new Date();
      await user.save();

      socket.user = user;

      console.log(`✅ Socket authenticated & user synced: ${user.username}`);

      // Attach chat & call events ngay khi user đã có
      chatEvents(socket, io);
      callEvents(socket, io);

      next();
    } catch (err) {
      console.error("❌ Socket auth error:", err);
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const { keycloakId, username } = socket.user || {};

    if (!keycloakId) {
      console.warn("Socket connected without user info!");
      return;
    }

    console.log(`🔌 User connected: ${keycloakId} (${socket.id})`);

    io.emit("presence_update", { userId: keycloakId, status: "Online" });

    // Ghi log kết nối
    AuditLog.create({
      user: keycloakId,
      action: "user_connected",
      metadata: { socketId: socket.id },
      ip: socket.handshake.address,
    }).catch((err) => console.error("❌ AuditLog error:", err.message));

    // Khi disconnect
    socket.on("disconnect", async () => {
      try {
        socket.user.status = "Offline";
        socket.user.socketId = null;
        await socket.user.save();

        io.emit("presence_update", { userId: keycloakId, status: "Offline" });

        await AuditLog.create({
          user: keycloakId,
          action: "user_disconnected",
          metadata: {},
        });

        console.log(`❌ User disconnected: ${username || keycloakId}`);
      } catch (err) {
        console.error("❌ Disconnect error:", err.message);
      }
    });
  });

  return io;
};

module.exports = initSocket;
