// initSocket.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const chatEvents = require("./events/chat");
const callEvents = require("./events/call");
const User = require("../models/user");
const AuditLog = require("../models/auditLog");

const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // Middleware xác thực token và attach user + events ngay
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token provided"));

    try {
      const decoded = jwt.decode(token); // Chỉ decode, không verify
      if (!decoded) return next(new Error("Invalid token"));

      // Gán user vào socket
      socket.user = {
        keycloakId: decoded.sub,
        username: decoded.preferred_username,
        email: decoded.email,
        roles: decoded.realm_access?.roles || [],
      };

      console.log(`✅ Authenticated via Keycloak: ${socket.user.username}`);

      // Attach chat & call events ngay khi user đã có
      chatEvents(socket, io);
      callEvents(socket, io);

      next();
    } catch (err) {
      console.error("❌ Token decode error:", err);
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const { keycloakId, username } = socket.user || {};

    if (!keycloakId) {
      console.warn("Socket connected without user info!");
      return;
    }

    console.log(`🔌 User connected: ${keycloakId} (${socket.id})`);

    // Cập nhật trạng thái user
    await User.findOneAndUpdate(
      { keycloakId },
      { socketId: socket.id, status: "Online", lastSeen: new Date() }
    );

    io.emit("presence_update", { userId: keycloakId, status: "Online" });

    // Ghi log kết nối
    try {
      await AuditLog.create({
        user: keycloakId,
        action: "user_connected",
        metadata: { socketId: socket.id },
        ip: socket.handshake.address,
      });
    } catch (err) {
      console.error("❌ AuditLog error:", err.message);
    }

    // Khi disconnect
    socket.on("disconnect", async () => {
      await User.findOneAndUpdate({ keycloakId }, { status: "Offline" });
      io.emit("presence_update", { userId: keycloakId, status: "Offline" });

      try {
        await AuditLog.create({
          user: keycloakId,
          action: "user_disconnected",
          metadata: {},
        });
      } catch (err) {
        console.error("❌ AuditLog error:", err.message);
      }

      console.log(`❌ User disconnected: ${username || keycloakId}`);
    });
  });

  return io;
};

module.exports = initSocket;
