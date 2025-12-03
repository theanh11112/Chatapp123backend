// app.js - COMPLETE VERSION WITH SOCKET.IO AUDIO INTEGRATION
const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const cors = require("cors");
const session = require("express-session");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const path = require("path");
require("dotenv").config();
const mongoose = require("mongoose");

// Keycloak config
const { initKeycloak } = require("./keycloak-config");

// Import các route
const adminRoutes = require("./routes/adminRoutes");
const moderatorRoutes = require("./routes/moderatorRoutes");
const userRoutes = require("./routes/userRoutes");
const guestRoutes = require("./routes/guestRoutes");
const botRoutes = require("./routes/botRoutes");
const callRoutes = require("./routes/callRoutes");
const chatRoutes = require("./routes/chatRoutes");
const taskRoutes = require("./routes/taskRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const reportsRoutes = require("./routes/reportRoutes");
const taskMessageRoutes = require("./routes/taskMessageRoutes");

// KHÔNG IMPORT ZEGO ROUTES NỮA

// Khởi tạo Express app
const app = express();

// ==================
// 🔐 Session cho Keycloak
// ==================
const memoryStore = new session.MemoryStore();
app.use(
  session({
    secret: process.env.SESSION_SECRET || "keyboard_cat_secret_change_this",
    resave: false,
    saveUninitialized: false,
    store: memoryStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    },
  })
);

// ==================
// 🔑 Khởi tạo Keycloak
// ==================
const keycloak = initKeycloak(memoryStore);
app.use(keycloak.middleware());

// ==================
// 🛡️ Middleware bảo mật & parse
// ==================
// CORS Configuration - ĐÃ SỬA: XÓA ZEGO URLs
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin && process.env.NODE_ENV === "development") {
      return callback(null, true);
    }

    const allowedOrigins = [
      process.env.CLIENT_URL || "http://localhost:3000",
      "http://localhost:3000",
      // XÓA CÁC ZEGO URLs
    ];

    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      console.error("CORS blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Enable pre-flight for all routes

// Security headers - ĐÃ SỬA: XÓA ZEGO connect-src
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:", "blob:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          // XÓA ZEGO URLs
          process.env.CLIENT_URL || "http://localhost:3000",
        ],
        mediaSrc: ["'self'", "https:", "blob:"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'self'", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Body parsing
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
    parameterLimit: 10000,
  })
);
app.use(cookieParser());

// Security middleware
app.use(
  mongoSanitize({
    replaceWith: "_",
  })
);
app.use(xss());

// ==================
// 📊 Logging & Rate Limit
// ==================
if (process.env.NODE_ENV === "development") {
  app.use(
    morgan(":method :url :status :response-time ms - :res[content-length]")
  );
}

// Rate limiting - different for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    error: "Too many authentication attempts, please try again later.",
  },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    success: false,
    error: "Too many API requests, please slow down.",
  },
});

// Apply rate limiting
app.use(generalLimiter);
app.use("/call/", apiLimiter);
// XÓA: app.use("/zego/", apiLimiter);

// ==================
// 📁 Static Files (if needed)
// ==================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/public", express.static(path.join(__dirname, "public")));

// ==================
// 🧭 Gắn routes cho từng role
// ==================
app.use("/admin", adminRoutes(keycloak));
app.use("/moderator", moderatorRoutes(keycloak));
app.use("/users", userRoutes(keycloak));
app.use("/guest", guestRoutes(keycloak));
app.use("/bot", botRoutes(keycloak));
app.use("/call", callRoutes(keycloak)); // Audio/Video call routes - SỬA CHO SOCKET.IO
// XÓA: app.use("/zego", zegoRoutes);

app.use("/chat", chatRoutes);
app.use("/tasks", taskRoutes);
app.use("/notifications", notificationRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/reminders", reminderRoutes);
app.use("/settings", settingsRoutes);
app.use("/reports", reportsRoutes(keycloak));
app.use("/taskMessage", taskMessageRoutes);

// ==================
// 🏥 Health Check Endpoints
// ==================
app.get("/health", (req, res) => {
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Internal Chat System API",
    version: "2.0.0",
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(
        process.memoryUsage().heapTotal / 1024 / 1024
      )} MB`,
      heapUsed: `${Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024
      )} MB`,
    },
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    audioCalling: "Socket.IO Audio", // THÊM THÔNG TIN MỚI
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
  };

  console.log("✅ Health check passed");
  res.status(200).json(healthStatus);
});

app.get("/info", (req, res) => {
  res.json({
    success: true,
    app: "Internal Chat System",
    version: "2.0.0",
    description:
      "Enterprise chat application with real-time audio/video calling using Socket.IO",
    features: [
      "Real-time messaging",
      "Audio/Video calls (1-1 & group) via Socket.IO",
      "Task management",
      "File sharing",
      "Notifications",
      "User presence",
      "Peer-to-peer WebRTC",
    ],
    technologies: [
      "Node.js/Express",
      "MongoDB/Mongoose",
      "Socket.IO",
      "Keycloak",
      "WebRTC (native)",
    ],
    zegoIntegration: false, // ĐÃ XÓA
    socketioIntegration: true, // THÊM
    maxParticipants: 10, // Giảm xuống cho Socket.IO
    supportedCodecs: ["Opus", "VP8", "VP9", "H.264"],
    callQuality: ["SD", "HD"],
    timestamp: new Date().toISOString(),
  });
});

// ==================
// 🧱 Kiểm tra API mặc định
// ==================
app.get("/", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  res.json({
    success: true,
    message: "🚀 Internal Chat System API is running with Socket.IO Audio",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    baseUrl: baseUrl,
    services: {
      chat: `${baseUrl}/chat`,
      calls: `${baseUrl}/call`, // SOCKET.IO calls
      users: `${baseUrl}/users`,
      tasks: `${baseUrl}/tasks`,
      notifications: `${baseUrl}/notifications`,
      health: `${baseUrl}/health`,
      info: `${baseUrl}/info`,
      socketio: `${baseUrl}/ws-test`,
    },
    documentation: `${baseUrl}/api-docs`,
    support: "support@example.com",
    environment: process.env.NODE_ENV || "development",
    audioCalling: "Socket.IO WebRTC",
  });
});

// ==================
// 📡 WebSocket Test Endpoint
// ==================
app.get("/ws-test", (req, res) => {
  res.json({
    success: true,
    message: "WebSocket server is running",
    wsEndpoint: `ws://${req.get("host")}`,
    socketioEndpoint: `Socket.IO ready`,
    timestamp: new Date().toISOString(),
    features: ["Real-time messaging", "Audio/Video calls", "User presence"],
  });
});

// ==================
// ❌ Bắt lỗi route không tồn tại
// ==================
app.all("*", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  const availableEndpoints = {
    home: "GET /",
    health: "GET /health",
    info: "GET /info",
    wsTest: "GET /ws-test",
    call: {
      audio: "POST /call/start-audio-call",
      video: "POST /call/start-video-call",
      groupAudio: "POST /call/start-group-audio-call",
      groupVideo: "POST /call/start-group-video-call",
      status: "POST /call/update-call-status",
      end: "POST /call/end-call",
      join: "POST /call/join-call",
      leave: "POST /call/leave-call",
      logs: "POST /call/call-logs",
      details: "POST /call/call-details",
      ongoing: "GET /call/ongoing-calls",
      statistics: "GET /call/call-statistics",
      socketioConfig: "GET /call/socketio-config", // THÊM MỚI
    },
    users: "GET /users/*",
    chat: "GET /chat/*",
    tasks: "GET /tasks/*",
    notifications: "GET /notifications/*",
    admin: "GET /admin/*",
    moderator: "GET /moderator/*",
  };

  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
    availableEndpoints: availableEndpoints,
    documentation: `${baseUrl}/api-docs`,
    note: "Zego endpoints have been removed. Using Socket.IO Audio instead.",
  });
});

// ==================
// 🚨 Global Error Handler
// ==================
app.use((err, req, res, next) => {
  // Log error
  console.error("❌ Global error:", {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.keycloakId || "anonymous",
    error: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  // Determine status code
  let statusCode = err.statusCode || 500;
  let errorMessage = err.message || "Internal server error";
  let errorCode = err.code || "INTERNAL_SERVER_ERROR";

  // Handle specific error types
  if (err.name === "ValidationError") {
    statusCode = 400;
    errorMessage = "Validation failed";
    errorCode = "VALIDATION_ERROR";
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    errorMessage = "Invalid token";
    errorCode = "INVALID_TOKEN";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    errorMessage = "Token expired";
    errorCode = "TOKEN_EXPIRED";
  } else if (err.name === "MongoError" && err.code === 11000) {
    statusCode = 409;
    errorMessage = "Duplicate key error";
    errorCode = "DUPLICATE_KEY";
  } else if (err.type === "entity.parse.failed") {
    statusCode = 400;
    errorMessage = "Invalid JSON in request body";
    errorCode = "INVALID_JSON";
  }

  // CORS error
  if (err.message === "Not allowed by CORS") {
    statusCode = 403;
    errorMessage = "CORS policy violation";
    errorCode = "CORS_ERROR";
  }

  // Send error response
  const errorResponse = {
    success: false,
    error: errorMessage,
    code: errorCode,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  };

  // Add stack trace in development
  if (process.env.NODE_ENV === "development") {
    errorResponse.stack = err.stack;
    if (err.details) errorResponse.details = err.details;
  }

  res.status(statusCode).json(errorResponse);
});

// ==================
// ✅ Export app và keycloak
// ==================
module.exports = { app, keycloak };
