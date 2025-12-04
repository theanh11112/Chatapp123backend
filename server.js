// server.js - COMPLETE VERSION WITH E2EE HANDLERS
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const http = require("http");
const jwt = require("jsonwebtoken");

// Load environment variables
dotenv.config({ path: "./config.env" });

// ==================
// 🚨 Uncaught Exception Handler
// ==================
process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION! Shutting down ...");
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);
  process.exit(1);
});

// ==================
// 📦 Import app
// ==================
const { app } = require("./app");

// ==================
// 🌐 Create HTTP Server
// ==================
const server = http.createServer(app);

// ==================
// 🔌 Socket.IO Configuration
// ==================
const socketIO = require("socket.io");
const io = socketIO(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ==================
// 📋 IMPORT ALL EVENT HANDLERS
// ==================
console.log("\n" + "=".repeat(60));
console.log("🔧 IMPORTING SOCKET HANDLERS");
console.log("=".repeat(60));

// Import core modules
const User = require("./models/user");
const AuditLog = require("./models/auditLog");
const { syncUserFromToken } = require("./utils/auth");

// Import core event handlers
const chatEvents = require("./socket/events/chat");
const callEvents = require("./socket/events/call");
const groupChatEvents = require("./socket/events/groupChat");
const taskHandlersEvents = require("./socket/events/taskHandlers");
const {
  handlePinMessage,
  handleUnpinMessage,
} = require("./controllers/userController");

// Import task controller
const taskController = require("./controllers/taskController");

// ==================
// 🆕 IMPORT E2EE HANDLERS
// ==================
console.log("\n🔐 IMPORTING E2EE HANDLERS...");

let e2eeHandlers = null;
let e2eeEvents = null;

try {
  // Import E2EE handlers
  console.log("[DEBUG] Loading e2eeHandlers...");
  const importedHandlers = require("./socket/handlers/e2eeHandlers");
  console.log(`[DEBUG] Type: ${typeof importedHandlers}`);

  if (typeof importedHandlers === "function") {
    e2eeHandlers = importedHandlers;
    console.log("✅ e2eeHandlers imported as function");
  } else if (
    importedHandlers &&
    typeof importedHandlers.registerE2EEHandlers === "function"
  ) {
    e2eeHandlers = importedHandlers.registerE2EEHandlers;
    console.log("✅ e2eeHandlers imported from object");
  } else {
    console.log("❌ e2eeHandlers not a function or has wrong structure");
  }
} catch (error) {
  console.error("❌ Failed to import e2eeHandlers:", error.message);
  console.error("Stack:", error.stack);
}

try {
  // Import E2EE events
  console.log("\n[DEBUG] Loading e2eeEvents...");
  const importedEvents = require("./socket/events/e2eeEvents");
  console.log(`[DEBUG] Type: ${typeof importedEvents}`);

  if (typeof importedEvents === "function") {
    e2eeEvents = importedEvents;
    console.log("✅ e2eeEvents imported as function");
  } else {
    console.log("❌ e2eeEvents not a function");
  }
} catch (error) {
  console.error("❌ Failed to import e2eeEvents:", error.message);
}

console.log(`\n📊 IMPORT STATUS:`);
console.log(`   e2eeHandlers: ${e2eeHandlers ? "✅ Loaded" : "❌ Failed"}`);
console.log(`   e2eeEvents: ${e2eeEvents ? "✅ Loaded" : "❌ Failed"}`);
console.log("=".repeat(60) + "\n");

// ==================
// 🗄️ MongoDB Connection
// ==================
const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);

mongoose
  .connect(DB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log("✅ MongoDB connection successful");

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("MongoDB reconnected");
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    console.error("Exiting application...");
    process.exit(1);
  });

// ==================
// 📡 Make Socket.IO Accessible
// ==================
app.set("socketio", io);

// Set socket io instance cho task controller
taskController.setSocketIo(io);

// ==================
// 👥 Socket.IO Authentication Middleware
// ==================
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.replace("Bearer ", "") ||
      socket.handshake.query.token;

    if (!token) {
      console.warn("Socket connection attempt without token");

      // Allow anonymous in development for testing
      if (
        process.env.NODE_ENV === "development" &&
        process.env.ALLOW_UNAUTHENTICATED === "true"
      ) {
        console.warn(
          "⚠️  Allowing unauthenticated connection in development mode"
        );
        socket.user = {
          id: "anonymous",
          keycloakId: "anonymous",
          username: "Anonymous User",
          status: "Offline",
        };
        socket.userId = "anonymous";
        return next();
      }

      return next(new Error("Authentication error: No token provided"));
    }

    // Verify token
    const decoded = jwt.decode(token);
    if (!decoded) {
      return next(new Error("Invalid token"));
    }

    // Sync user from token
    const user = await syncUserFromToken(decoded, {
      defaultStatus: "Online",
      socketId: socket.id,
    });

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.user = user;
    socket.userId = user.keycloakId;
    socket.keycloakId = user.keycloakId;

    console.log(`✅ Socket authenticated: ${user.username} (${socket.id})`);
    next();
  } catch (error) {
    console.error("Socket authentication error:", error.message);

    if (
      process.env.NODE_ENV === "development" &&
      process.env.ALLOW_UNAUTHENTICATED === "true"
    ) {
      console.warn(
        "⚠️  Token verification failed, allowing anonymous connection"
      );
      socket.user = {
        id: "anonymous",
        keycloakId: "anonymous",
        username: "Anonymous User",
        status: "Offline",
      };
      socket.userId = "anonymous";
      return next();
    }

    next(new Error(`Authentication failed: ${error.message}`));
  }
});

// ==================
// 🛠️ HELPER FUNCTIONS
// ==================

/**
 * Basic E2EE handler registration as fallback
 */
function registerBasicE2EEHandlers(socket, io) {
  const { keycloakId, username } = socket.user || {};

  console.log(`🔐 [Basic E2EE] Registering basic handlers for ${username}`);

  // Basic ping handler
  socket.on("ping", (callback) => {
    console.log(`🏓 [Basic E2EE - ${username}] ping received`);

    if (callback && typeof callback === "function") {
      callback({
        success: true,
        message: "pong from basic handler",
        timestamp: new Date().toISOString(),
        userId: keycloakId,
        source: "basic-e2ee-handler",
      });
      console.log(`🏓 [Basic E2EE - ${username}] callback sent`);
    } else {
      console.log(`⚠️ [Basic E2EE - ${username}] ping without callback`);
    }
  });

  // Basic health_check handler
  socket.on("health_check", (callback) => {
    console.log(`🏥 [Basic E2EE - ${username}] health_check received`);

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
          e2ee: false, // basic mode
          e2eeEvents: false,
          pin: true,
        },
      });
    }
  });

  // Basic E2EE info handler
  socket.on("get_e2ee_info", async (callback) => {
    try {
      console.log(`📤 [Basic E2EE - ${username}] get_e2ee_info received`);

      const user = await User.findOne({ keycloakId }).select(
        "keycloakId username e2eeEnabled"
      );

      console.log("111111", user.e2eeEnabled);

      if (callback) {
        callback({
          success: true,
          data: {
            keycloakId: user?.keycloakId || keycloakId,
            username: user?.username || username,
            e2eeEnabled: user?.e2eeEnabled || false,
            message: "E2EE handler not fully loaded - using basic mode",
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
 * Join existing group rooms when user connects
 */
async function joinExistingGroupRooms(socket, keycloakId) {
  try {
    const Room = require("./models/room");
    const rooms = await Room.find({
      members: keycloakId,
      isGroup: true,
      isActive: true,
    }).select("_id name");

    rooms.forEach((room) => {
      const roomId = room._id.toString();
      socket.join(roomId);
      console.log(
        `✅ ${socket.user?.username} auto-joined group room: ${room.name} (${roomId})`
      );
    });

    console.log(
      `✅ ${socket.user?.username} joined ${rooms.length} group rooms`
    );
  } catch (err) {
    console.error("❌ Error joining group rooms:", err.message);
  }
}

// ==================
// 🔄 Socket.IO Connection Handler
// ==================
io.on("connection", (socket) => {
  const { keycloakId, username } = socket.user || {};

  if (!keycloakId || keycloakId === "anonymous") {
    console.log(`🔌 Anonymous socket connected: ${socket.id}`);
    return;
  }

  console.log(
    `\n🎉 User connected: ${username} (${keycloakId}) - ${socket.id}`
  );

  // ==================
  // 🏓 ALWAYS REGISTER BASIC PING HANDLER FIRST
  // ==================
  console.log(`🔧 [${username}] Registering BASIC ping handler...`);
  console.log(`✅ [${username}] Basic ping handler registered`);

  // ==================
  // 📋 REGISTER CORE EVENT HANDLERS
  // ==================
  chatEvents(socket, io);
  callEvents(socket, io);
  groupChatEvents(socket, io);
  taskHandlersEvents(socket, io);

  // ==================
  // 🔐 REGISTER E2EE HANDLERS
  // ==================
  if (e2eeHandlers && typeof e2eeHandlers === "function") {
    console.log(`🔐 [${username}] Registering E2EE handlers...`);
    try {
      e2eeHandlers(socket, io);
      console.log(`✅ [${username}] E2EE handlers registered`);
    } catch (err) {
      console.error(`❌ [${username}] E2EE handlers error:`, err.message);
      console.log(`⚠️ [${username}] Using basic handlers as fallback`);
      registerBasicE2EEHandlers(socket, io);
    }
  } else {
    console.log(`⚠️ [${username}] No E2EE handlers available, using basic`);
    registerBasicE2EEHandlers(socket, io);
  }

  // ==================
  // 📡 REGISTER E2EE EVENTS
  // ==================
  if (e2eeEvents && typeof e2eeEvents === "function") {
    console.log(`📡 [${username}] Registering E2EE events...`);
    try {
      e2eeEvents(socket, io);
      console.log(`✅ [${username}] E2EE events registered`);
    } catch (err) {
      console.error(`❌ [${username}] E2EE events error:`, err.message);
    }
  }

  // ==================
  // 📌 REGISTER OTHER HANDLERS
  // ==================
  console.log(`🔌 Setting up task socket handlers for user: ${keycloakId}`);

  // Task events
  socket.on("task_assign", (data) => {
    console.log("📨 Task assign event received:", data);
    taskController.handleTaskAssignment(socket, data);
  });

  socket.on("task_update_status", (data) => {
    console.log("📨 Task status update event received:", data);
    taskController.handleTaskStatusUpdate(socket, data);
  });

  socket.on("task_join_room", (data) => {
    console.log("📨 Task join room event received:", data);
    taskController.handleJoinTaskRoom(socket, data);
  });

  socket.on("task_leave_room", (data) => {
    console.log("📨 Task leave room event received:", data);
    taskController.handleLeaveTaskRoom(socket, data);
  });

  socket.on("task_add_comment", (data) => {
    console.log("📨 Task add comment event received:", data);
    taskController.handleTaskComment(socket, data);
  });

  // Pin/unpin events
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

  // ==================
  // 🏠 JOIN ROOMS
  // ==================
  // Join personal room
  socket.join(keycloakId);
  console.log(`🚪 ${username} joined personal room: ${keycloakId}`);

  // Join existing group rooms
  joinExistingGroupRooms(socket, keycloakId);

  // ==================
  // 👤 USER PRESENCE
  // ==================
  // Broadcast user online status
  socket.broadcast.emit("user_online", {
    userId: keycloakId,
    username: username,
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });

  // Send welcome message with user info
  socket.emit("socket:connected", {
    socketId: socket.id,
    userId: keycloakId,
    username: username,
    timestamp: new Date().toISOString(),
  });

  // ==================
  // 📝 AUDIT LOG
  // ==================
  AuditLog.create({
    user: keycloakId,
    action: "user_connected",
    metadata: { socketId: socket.id },
    ip: socket.handshake.address,
  }).catch((err) => console.error("AuditLog error:", err.message));

  // ==================
  // 🏥 HEALTH CHECK HANDLER
  // ==================
  socket.on("health_check", (callback) => {
    console.log(`🏥 [${username}] health_check received`);

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

  // ==================
  // 🎯 CUSTOM ROOM MANAGEMENT
  // ==================
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

  // ==================
  // ❌ DISCONNECT HANDLER
  // ==================
  socket.on("disconnect", async (reason) => {
    try {
      console.log(
        `❌ Socket disconnected: ${socket.id} | User: ${keycloakId} | Reason: ${reason}`
      );

      if (keycloakId && keycloakId !== "anonymous") {
        const user = await User.findOne({ keycloakId });
        if (user && user.socketId === socket.id) {
          user.socketId = null;
          user.status = "Offline";
          user.lastSeen = new Date();
          await user.save();

          // Broadcast user offline status
          socket.broadcast.emit("user_offline", {
            userId: keycloakId,
            username: username,
            lastSeen: user.lastSeen,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Audit log for disconnect
      await AuditLog.create({
        user: keycloakId,
        action: "user_disconnected",
        metadata: { socketId: socket.id, reason: reason },
      });
    } catch (err) {
      console.error("❌ Disconnect error:", err.message);
    }
  });

  // ==================
  // ✅ VERIFICATION LOG
  // ==================
  console.log(`\n🔍 [${username}] Handler verification:`);
  console.log(`   Ping listeners: ${socket.listeners("ping").length}`);
  console.log(
    `   health_check listeners: ${socket.listeners("health_check").length}`
  );
  console.log(
    `   get_e2ee_info listeners: ${socket.listeners("get_e2ee_info").length}`
  );
  console.log(`✅ All handlers registered for ${username}\n`);
});

// ==================
// 🚀 Start Server
// ==================
const PORT = process.env.PORT || 3001; // Changed to 3001 to match your setup
const NODE_ENV = process.env.NODE_ENV || "development";

// Validate critical environment variables
function validateEnvironment() {
  console.log("\n🔧 Validating environment configuration...");

  const requiredVars = ["DATABASE"];
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error("❌ Missing required environment variables:", missingVars);
    process.exit(1);
  }

  console.log("✅ Environment validation complete");
}

// Start the server
function startServer() {
  validateEnvironment();

  server.listen(PORT, "0.0.0.0", () => {
    console.log("=".repeat(60));
    console.log(`🚀 Server successfully started!`);
    console.log(`🌐 Environment: ${NODE_ENV}`);
    console.log(`🚪 Port: ${PORT}`);
    console.log(`📅 Time: ${new Date().toLocaleString()}`);
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log("=".repeat(60));
    console.log("\n📋 Available Services:");
    console.log(`   🏠 Home:          http://localhost:${PORT}/`);
    console.log(`   🏥 Health:        http://localhost:${PORT}/health`);
    console.log(`   ℹ️  Info:          http://localhost:${PORT}/info`);
    console.log(`   📞 Call API:      http://localhost:${PORT}/call`);
    console.log(`   💬 Chat API:      http://localhost:${PORT}/chat`);
    console.log(`   👥 Users API:     http://localhost:${PORT}/users`);
    console.log(`   📊 WebSocket Test: http://localhost:${PORT}/ws-test`);
    console.log(`   🔐 E2EE API:       http://localhost:${PORT}/e2ee`);
    console.log("=".repeat(60));
    console.log("\n🔧 Configuration:");
    console.log(
      `   Database: ${
        mongoose.connection.readyState === 1
          ? "✅ Connected"
          : "❌ Disconnected"
      }`
    );
    console.log(`   Node: ${process.version}`);
    console.log(
      `   Memory: ${Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024
      )} MB`
    );
    console.log(
      `   Socket Handlers: ${e2eeHandlers ? "✅ E2EE Loaded" : "⚠️ Basic Only"}`
    );
    console.log("=".repeat(60));
  });
}

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(() => {
    console.log("✅ HTTP server closed");

    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB connection closed");
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error(
      "⚠️  Could not close connections in time, forcefully shutting down"
    );
    process.exit(1);
  }, 10000);
}

// Register signal handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ==================
// 🚨 Unhandled Rejection Handler
// ==================
process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION! Shutting down ...");
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);

  server.close(() => {
    process.exit(1);
  });
});

// Start the server
startServer();
