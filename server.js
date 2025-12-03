// server.js - OPTIMIZED VERSION
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

// Import modules
const User = require("./models/user");
const AuditLog = require("./models/auditLog");
const { syncUserFromToken } = require("./utils/auth");

// Import event handlers
const chatEvents = require("./socket/events/chat");
const callEvents = require("./socket/events/call");
const groupChatEvents = require("./socket/events/groupChat");
const taskHandlersEvents = require("./socket/events/taskHandlers");
const {
  handlePinMessage,
  handleUnpinMessage,
} = require("./controllers/userController");

// 🆕 THÊM: Import task controller
const taskController = require("./controllers/taskController");

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

// 🆕 THÊM: Set socket io instance cho task controller
taskController.setSocketIo(io);

// ==================
// 👥 Socket.IO Authentication Middleware (SIMPLIFIED)
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

    // Verify token - SIMPLIFIED VERSION
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
// 🔄 Socket.IO Connection Handler (SIMPLIFIED)
// ==================
io.on("connection", (socket) => {
  const { keycloakId, username } = socket.user || {};

  if (!keycloakId || keycloakId === "anonymous") {
    console.log(`🔌 Anonymous socket connected: ${socket.id}`);
    return;
  }

  console.log(`🔌 User connected: ${username} (${keycloakId}) - ${socket.id}`);

  // ==================
  // 📋 REGISTER EVENT HANDLERS
  // ==================
  chatEvents(socket, io);
  callEvents(socket, io);
  groupChatEvents(socket, io);
  taskHandlersEvents(socket, io);

  // ==================
  // 📌 TASK EVENTS
  // ==================
  console.log(`🔌 Setting up task socket handlers for user: ${keycloakId}`);

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

  // ==================
  // 📌 PIN/UNPIN MESSAGE EVENTS
  // ==================
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
});

// ==================
// 🚀 Start Server
// ==================
const PORT = process.env.PORT || 8000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Validate critical environment variables
function validateEnvironment() {
  console.log("🔧 Validating environment configuration...");

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
    console.log("=".repeat(60));
    console.log("\n🔧 Configuration:");
    console.log(`   Database: Connected`);
    console.log(`   Node: ${process.version}`);
    console.log(
      `   Memory: ${Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024
      )} MB`
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
