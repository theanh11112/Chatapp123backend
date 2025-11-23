// initSocket.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const AuditLog = require("../models/auditLog");
const User = require("../models/user");

const chatEvents = require("./events/chat");
const callEvents = require("./events/call");
const groupChatEvents = require("./events/groupChat");
const { syncUserFromToken } = require("../utils/auth");
const {
  handlePinMessage,
  handleUnpinMessage,
} = require("../controllers/userController"); // 🆕 THÊM import

const initSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // -----------------------------
  //  MIDDLEWARE AUTH SOCKET
  // -----------------------------
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.decode(token);
      if (!decoded) return next(new Error("Invalid token"));

      // Đồng bộ user vào DB với socketId hiện tại - ĐÃ SỬA
      const user = await syncUserFromToken(decoded, {
        defaultStatus: "Online",
        socketId: socket.id, // ← THÊM socketId vào đây
      });

      socket.user = user;
      socket.userId = user.keycloakId; // 🆕 THÊM: Gán userId cho socket để dùng trong pin/unpin
      console.log(
        `✅ Authenticated: ${user.username} (socketId: ${socket.id})`
      );

      next();
    } catch (err) {
      console.error("❌ Socket auth failed:", err);
      next(new Error("Socket authentication failed"));
    }
  });

  // -----------------------------
  //  ON CONNECTION
  // -----------------------------
  io.on("connection", (socket) => {
    const { keycloakId, username } = socket.user;

    console.log(`🔌 Connected: ${keycloakId} (${socket.id})`);

    // Gắn sự kiện chat & call SAU KHI connection hoàn tất - ĐÃ SỬA
    chatEvents(socket, io);
    callEvents(socket, io);
    groupChatEvents(socket, io);

    // 🆕 THÊM: Pin/Unpin message events
    socket.on("pin_direct_message", (data) => {
      console.log("📌 Pin direct message event received:", data);
      handlePinMessage(socket, data);
    });

    socket.on("pin_group_message", (data) => {
      console.log("📌 Pin group message event received:", data);
      handlePinMessage(socket, data);
    });

    socket.on("unpin_direct_message", (data) => {
      console.log("📌 Unpin direct message event received:", data);
      handleUnpinMessage(socket, data);
    });

    socket.on("unpin_group_message", (data) => {
      console.log("📌 Unpin group message event received:", data);
      handleUnpinMessage(socket, data);
    });

    // 🆕 THÊM: Các events cho HTTP endpoints (nếu cần)
    socket.on("pin_message", (data) => {
      console.log("📌 Pin message event received:", data);
      handlePinMessage(socket, data);
    });

    socket.on("unpin_message", (data) => {
      console.log("📌 Unpin message event received:", data);
      handleUnpinMessage(socket, data);
    });

    // Broadcast realtime cho tất cả bạn bè hoặc toàn bộ app - ĐÃ SỬA
    socket.broadcast.emit("user_online", {
      userId: socket.user.keycloakId,
      username: socket.user.username,
      avatar: socket.user.avatar,
      socketId: socket.id, // ← THÊM socketId mới nhất
    });

    // Ghi log connection
    AuditLog.create({
      user: keycloakId,
      action: "user_connected",
      metadata: { socketId: socket.id },
      ip: socket.handshake.address,
    }).catch((err) => console.error("AuditLog error:", err.message));

    // -----------------------------
    //  ON DISCONNECT
    // -----------------------------
    socket.on("disconnect", async () => {
      try {
        const user = await User.findOne({ keycloakId });
        if (!user) return;

        // Chỉ cập nhật nếu socketId disconnect là socketId hiện tại - ĐÃ SỬA
        if (user.socketId === socket.id) {
          user.socketId = null; // ← RESET socketId
          user.status = "Offline";
          user.lastSeen = new Date();
          await user.save();

          // Broadcast realtime offline - ĐÃ SỬA
          socket.broadcast.emit("user_offline", {
            userId: keycloakId,
            lastSeen: user.lastSeen,
          });
        }

        // Ghi log disconnect
        await AuditLog.create({
          user: keycloakId,
          action: "user_disconnected",
          metadata: { socketId: socket.id },
        });

        console.log(
          `❌ Disconnected: ${username || keycloakId} (socketId: ${socket.id})`
        );
      } catch (err) {
        console.error("❌ Disconnect error:", err.message);
      }
    });
  });

  return io;
};

module.exports = initSocket;
