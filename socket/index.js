// socket/index.js - FIXED VERSION
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const AuditLog = require("../models/auditLog");
const User = require("../models/user");
const Room = require("../models/room");

const chatEvents = require("./events/chat");
const callEvents = require("./events/call");
const groupChatEvents = require("./events/groupChat");
const taskHandlersEvents = require("./events/taskHandlers");

const { syncUserFromToken } = require("../utils/auth");
const userController = require("../controllers/userController");

// ==================== DEBUG: CHECK IMPORTS ====================
console.log("\n" + "=".repeat(60));
console.log("🔧 [DEBUG] SOCKET INIT STARTING");
console.log("=".repeat(60));

// Import E2EE handlers - THÊM DEBUG
let e2eeHandlers = null;
try {
  console.log("[DEBUG] Importing e2eeHandlers...");
  const imported = require("./handlers/e2eeHandlers");
  console.log(`[DEBUG] Imported type: ${typeof imported}`);

  if (typeof imported === "function") {
    e2eeHandlers = imported;
    console.log("[DEBUG] ✅ e2eeHandlers is a function");
  } else {
    console.log("[DEBUG] ❌ e2eeHandlers is not a function");
    console.log("[DEBUG] Keys:", Object.keys(imported || {}));
  }
} catch (error) {
  console.error("[DEBUG] ❌ Import error:", error.message);
}

// Import E2EE events
let e2eeEvents = null;
try {
  console.log("\n[DEBUG] Importing e2eeEvents...");
  const imported = require("./events/e2eeEvents");
  console.log(`[DEBUG] Imported type: ${typeof imported}`);

  if (typeof imported === "function") {
    e2eeEvents = imported;
    console.log("[DEBUG] ✅ e2eeEvents is a function");
  } else {
    console.log("[DEBUG] ❌ e2eeEvents is not a function");
  }
} catch (error) {
  console.error("[DEBUG] ❌ Import error:", error.message);
}

console.log(`\n[DEBUG] FINAL STATUS:`);
console.log(`  e2eeHandlers: ${e2eeHandlers ? "✅ Loaded" : "❌ NULL"}`);
console.log(`  e2eeEvents: ${e2eeEvents ? "✅ Loaded" : "❌ NULL"}`);
console.log("=".repeat(60) + "\n");

const taskController = require("../controllers/taskController");

const initSocket = (server) => {
  console.log("🔍 [Socket] Creating Socket.IO server instance");

  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  console.log("✅ [Socket] Socket.IO server created");

  // Set socket io instance cho task controller
  taskController.setSocketIo(io);

  // -----------------------------
  //  MIDDLEWARE AUTH SOCKET
  // -----------------------------
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        console.error("❌ [Socket Middleware] No token provided");
        return next(new Error("No token provided"));
      }

      const decoded = jwt.decode(token);

      if (!decoded) {
        console.error("❌ [Socket Middleware] Invalid token");
        return next(new Error("Invalid token"));
      }

      // Đồng bộ user vào DB với socketId hiện tại
      const user = await syncUserFromToken(decoded, {
        defaultStatus: "Online",
        socketId: socket.id,
        deviceInfo: {
          device: socket.handshake.headers["user-agent"] || "unknown",
          lastSeenAt: new Date(),
          ip: socket.handshake.address,
          platform: socket.handshake.headers["sec-ch-ua-platform"] || "unknown",
        },
      });

      socket.user = user;
      socket.userId = user.keycloakId;

      console.log(
        `✅ [Socket Middleware] Authenticated: ${user.username} (${socket.id})`
      );

      next();
    } catch (err) {
      console.error("❌ [Socket Middleware] Auth failed:", err.message);
      next(new Error("Socket authentication failed"));
    }
  });

  // -----------------------------
  //  ON CONNECTION - FIXED SECTION
  // -----------------------------
  io.on("connection", (socket) => {
    if (!socket.user) {
      console.error("❌ [Socket Connection] Socket has no user object!");
      socket.disconnect();
      return;
    }

    const { keycloakId, username } = socket.user;

    console.log(`🎉 [Socket Connection] Connected: ${username} (${socket.id})`);

    // Join personal room
    socket.join(keycloakId);

    // 2. Register other core handlers
    chatEvents(socket, io);
    callEvents(socket, io);
    groupChatEvents(socket, io);
    taskHandlersEvents(socket, io);

    // 3. Try to register E2EE handlers
    if (e2eeHandlers && typeof e2eeHandlers === "function") {
      console.log(`🔐 [${username}] Registering E2EE handlers...`);
      try {
        e2eeHandlers(socket, io);
        console.log(`✅ [${username}] E2EE handlers registered`);
      } catch (err) {
        console.error(`❌ [${username}] E2EE handlers error:`, err.message);
      }
    } else {
      console.log(`⚠️ [${username}] No E2EE handlers, using basic fallback`);
      registerBasicE2EEHandlers(socket, io);
    }

    // 4. Register E2EE broadcast events
    if (e2eeEvents && typeof e2eeEvents === "function") {
      console.log(`📡 [${username}] Registering E2EE events...`);
      try {
        e2eeEvents(socket, io);
        console.log(`✅ [${username}] E2EE events registered`);
      } catch (err) {
        console.error(`❌ [${username}] E2EE events error:`, err.message);
      }
    }

    // 5. Register other handlers
    registerTaskHandlers(socket, io);
    registerPinHandlers(socket, io);

    // ==================== DEBUG: VERIFY HANDLERS ====================
    console.log(`\n🔍 [${username}] Handler verification:`);
    console.log(`   Ping listeners: ${socket.listeners("ping").length}`);
    console.log(
      `   get_e2ee_info listeners: ${socket.listeners("get_e2ee_info").length}`
    );
    console.log(
      `   get_my_e2ee_keys listeners: ${
        socket.listeners("get_my_e2ee_keys").length
      }`
    );
    console.log(
      `   toggle_e2ee listeners: ${socket.listeners("toggle_e2ee").length}`
    );
    console.log(`========================================\n`);
    // Join existing group rooms
    joinExistingGroupRooms(socket, keycloakId);

    // ==================== CUSTOM ROOM MANAGEMENT ====================
    socket.on("join_keycloak_room", ({ keycloakId: targetRoomId }) => {
      if (targetRoomId) {
        socket.join(targetRoomId);
        console.log(`🚪 [${username}] manually joined room: ${targetRoomId}`);
      }
    });

    socket.on("join_room", ({ roomId }) => {
      if (roomId) {
        socket.join(roomId);
        console.log(`🚪 [${username}] joined room: ${roomId}`);
      }
    });

    socket.on("leave_room", ({ roomId }) => {
      if (roomId) {
        socket.leave(roomId);
        console.log(`🚪 [${username}] left room: ${roomId}`);
      }
    });

    // ==================== USER PRESENCE ====================
    broadcastUserOnline(socket, io);

    // ==================== AUDIT LOGGING ====================
    AuditLog.create({
      user: keycloakId,
      action: "user_connected",
      metadata: {
        socketId: socket.id,
        device: socket.handshake.headers["user-agent"] || "unknown",
        ip: socket.handshake.address,
      },
      ip: socket.handshake.address,
    }).catch((err) => console.error("❌ AuditLog error:", err.message));

    // ==================== HEALTH CHECK ====================
    socket.on("health_check", (callback) => {
      if (callback && typeof callback === "function") {
        callback({
          status: "healthy",
          userId: keycloakId,
          username: username,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
          handlers: {
            chat: true,
            call: true,
            groupChat: true,
            tasks: true,
            e2ee: !!e2eeHandlers,
            e2eeEvents: !!e2eeEvents,
            pin: true,
          },
        });
      }
    });

    // ==================== DISCONNECTION HANDLING ====================
    socket.on("disconnect", async (reason) => {
      await handleDisconnect(socket, io, reason);
    });

    console.log(
      `✅ [Socket Connection] All handlers registered for ${username}`
    );
  });

  return io;
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Basic E2EE handler registration as fallback
 */
function registerBasicE2EEHandlers(socket, io) {
  const { keycloakId, username } = socket.user;

  console.log(`🔐 [Basic E2EE] Registering basic handlers for ${username}`);

  // Basic ping handler
  socket.on("ping", (callback) => {
    if (callback && typeof callback === "function") {
      callback({
        success: true,
        message: "pong from basic handler",
        timestamp: new Date().toISOString(),
        userId: keycloakId,
        source: "basic-e2ee-handler",
      });
    }
  });

  // Basic E2EE info handler
  socket.on("get_e2ee_info", async (callback) => {
    try {
      const user = await User.findOne({ keycloakId }).select(
        "keycloakId username e2eeEnabled"
      );

      if (callback) {
        callback({
          success: true,
          data: {
            keycloakId: user?.keycloakId || keycloakId,
            username: user?.username || username,
            e2eeEnabled: user?.e2eeEnabled || false,
            message: "E2EE handler not fully loaded",
            source: "basic-e2ee-handler",
          },
        });
      }
    } catch (err) {
      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  console.log(`✅ [Basic E2EE] Basic handlers registered for ${username}`);
}

/**
 * Basic E2EE broadcast events as fallback
 */
function registerBasicE2EEBroadcastEvents(socket, io) {
  const { keycloakId, username } = socket.user;

  console.log(
    `📡 [Basic E2EE Broadcast] Registering basic broadcast events for ${username}`
  );

  // Basic key exchange request handler
  socket.on("key_exchange_request", (data) => {
    console.log(
      `🔄 [Basic E2EE Broadcast - ${username}] Received key exchange request from ${data.from}`
    );

    // Forward to client
    socket.emit("key_exchange_request_received", {
      ...data,
      receivedAt: new Date(),
      source: "basic-e2ee-broadcast",
    });
  });

  // Basic friend E2EE status change handler
  socket.on("friend_e2ee_status_changed", (data) => {
    console.log(
      `🔄 [Basic E2EE Broadcast - ${username}] Friend ${data.userId} changed E2EE status`
    );

    // Forward to client
    socket.emit("friend_e2ee_status_updated", {
      ...data,
      receivedAt: new Date(),
      source: "basic-e2ee-broadcast",
    });
  });

  // Basic encrypted message handler
  socket.on("encrypted_message_received", (data) => {
    console.log(
      `🔐 [Basic E2EE Broadcast - ${username}] Received encrypted message`
    );

    // Forward to client
    socket.emit("encrypted_message", {
      ...data,
      receivedAt: new Date(),
      source: "basic-e2ee-broadcast",
    });
  });

  console.log(
    `✅ [Basic E2EE Broadcast] Basic broadcast events registered for ${username}`
  );
}

/**
 * Join existing group rooms when user connects
 */
async function joinExistingGroupRooms(socket, keycloakId) {
  try {
    const rooms = await Room.find({
      members: keycloakId,
      isGroup: true,
      isActive: true,
    }).select("_id name");

    rooms.forEach((room) => {
      const roomId = room._id.toString();
      socket.join(roomId);
      console.log(
        `✅ [joinExistingGroupRooms] ${socket.user.username} auto-joined group room: ${room.name} (${roomId})`
      );
    });

    console.log(
      `✅ [joinExistingGroupRooms] ${socket.user.username} joined ${rooms.length} group rooms`
    );
  } catch (err) {
    console.error("❌ [joinExistingGroupRooms] Error:", err.message);
  }
}

/**
 * Register task event handlers
 */
function registerTaskHandlers(socket, io) {
  const { username } = socket.user;

  console.log(`📋 [registerTaskHandlers] Registering for ${username}`);

  // Task Assignment
  socket.on("task_assign", (data) => {
    taskController.handleTaskAssignment(socket, data);
  });

  // Task Status Update
  socket.on("task_update_status", (data) => {
    taskController.handleTaskStatusUpdate(socket, data);
  });

  // Task Room Management
  socket.on("task_join_room", (data) => {
    taskController.handleJoinTaskRoom(socket, data);
  });

  socket.on("task_leave_room", (data) => {
    taskController.handleLeaveTaskRoom(socket, data);
  });

  // Task Comments
  socket.on("task_add_comment", (data) => {
    taskController.handleTaskComment(socket, data);
  });

  console.log(
    `✅ [registerTaskHandlers] Task handlers registered for ${username}`
  );
}

/**
 * Register pin/unpin handlers
 */
function registerPinHandlers(socket, io) {
  const { username } = socket.user;

  console.log(`📌 [registerPinHandlers] Registering for ${username}`);

  // Sử dụng các hàm từ userController
  // Direct Messages
  socket.on("pin_direct_message", (data) => {
    userController.handlePinMessage(socket, data);
  });

  socket.on("unpin_direct_message", (data) => {
    userController.handleUnpinMessage(socket, data);
  });

  // Group Messages
  socket.on("pin_group_message", (data) => {
    userController.handlePinMessage(socket, data);
  });

  socket.on("unpin_group_message", (data) => {
    userController.handleUnpinMessage(socket, data);
  });

  // Generic endpoints
  socket.on("pin_message", (data) => {
    userController.handlePinMessage(socket, data);
  });

  socket.on("unpin_message", (data) => {
    userController.handleUnpinMessage(socket, data);
  });

  console.log(
    `✅ [registerPinHandlers] Pin handlers registered for ${username}`
  );
}

/**
 * Broadcast user online status
 */
function broadcastUserOnline(socket, io) {
  const { keycloakId, username, avatar } = socket.user;

  // Broadcast to all connected clients
  socket.broadcast.emit("user_online", {
    userId: keycloakId,
    username: username,
    avatar: avatar,
    socketId: socket.id,
    timestamp: new Date(),
  });

  console.log(
    `📢 [broadcastUserOnline] Broadcasted online status for ${username}`
  );
}

/**
 * Handle user disconnection
 */
async function handleDisconnect(socket, io, reason) {
  const { keycloakId, username } = socket.user;

  console.log(
    `🔌 [handleDisconnect] ${username} disconnecting. Reason: ${reason}`
  );

  try {
    // Update user status
    const user = await User.findOne({ keycloakId });
    if (!user) {
      console.log(
        `❌ [handleDisconnect] User ${keycloakId} not found during disconnect`
      );
      return;
    }

    // Only update if disconnecting socket is the current socket
    if (user.socketId === socket.id) {
      user.status = "Offline";
      user.lastSeen = new Date();
      user.socketId = null;
      await user.save();

      // Broadcast offline status
      socket.broadcast.emit("user_offline", {
        userId: keycloakId,
        username: username,
        lastSeen: user.lastSeen,
        reason: reason,
        timestamp: new Date(),
      });

      // Notify friends about E2EE status change
      if (user.e2eeEnabled && user.friends && user.friends.length > 0) {
        user.friends.forEach((friendKeycloakId) => {
          io.to(friendKeycloakId).emit("friend_e2ee_status_changed", {
            userId: keycloakId,
            username: user.username,
            e2eeEnabled: false,
            timestamp: new Date(),
            reason: "user_offline",
            source: "initSocket",
          });
        });
      }

      console.log(`✅ [handleDisconnect] ${username} marked as offline`);
    } else {
      console.log(
        `⚠️ [handleDisconnect] ${username} had multiple sockets. Keeping other socket active.`
      );
    }

    // Log disconnection
    await AuditLog.create({
      user: keycloakId,
      action: "user_disconnected",
      metadata: {
        socketId: socket.id,
        reason: reason,
        rooms: Array.from(socket.rooms),
      },
    });

    console.log(
      `❌ [handleDisconnect] Disconnected: ${username} (${socket.id}) - ${reason}`
    );
  } catch (err) {
    console.error(`❌ [handleDisconnect] Error for ${username}:`, err.message);
  }
}

module.exports = initSocket;
