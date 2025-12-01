// app.js
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
require("dotenv").config();

// Keycloak config
const { initKeycloak } = require("./keycloak-config");

// Import các route đã chia role
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

// Khởi tạo Express app
const app = express();

// ==================
// 🔐 Session cho Keycloak
// ==================
const memoryStore = new session.MemoryStore();
app.use(
  session({
    secret: process.env.SESSION_SECRET || "keyboard cat",
    resave: false,
    saveUninitialized: true,
    store: memoryStore,
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
app.use(
  cors({
    origin: "*", // Bạn có thể thay bằng origin cụ thể frontend
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(mongoSanitize()); // Chặn NoSQL Injection
app.use(xss()); // Ngăn XSS Attack

// ==================
// 📊 Logging & Rate Limit
// ==================
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

const limiter = rateLimit({
  max: 3000,
  windowMs: 60 * 60 * 1000, // 1 giờ
  message: "Too many requests from this IP, please try again later.",
});
app.use(limiter);

// ==================
// 🧭 Gắn routes cho từng role
// ==================
app.use("/admin", adminRoutes(keycloak));
app.use("/moderator", moderatorRoutes(keycloak));
app.use("/users", userRoutes(keycloak));
app.use("/guest", guestRoutes(keycloak));
app.use("/bot", botRoutes(keycloak));
app.use("/call", callRoutes(keycloak));
app.use("/chat", chatRoutes);
app.use("/tasks", taskRoutes);
app.use("/notifications", notificationRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/reminders", reminderRoutes);
app.use("/settings", settingsRoutes);
app.use("/reports", reportsRoutes(keycloak));
app.use("/taskMessage", taskMessageRoutes);

// ==================
// 🧱 Kiểm tra API mặc định
// ==================
app.get("/", (req, res) => {
  res.json({ message: "Internal Chat System API đang hoạt động 🚀" });
});

// ==================
// ❌ Bắt lỗi route không tồn tại
// ==================
app.all("*", (req, res) => {
  res.status(404).json({
    status: "fail",
    message: `Không tìm thấy đường dẫn: ${req.originalUrl}`,
  });
});

// ==================
// ✅ Export app để server.js sử dụng
// ==================
module.exports = app;
