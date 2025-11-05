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

const { initKeycloak } = require("./keycloak-config");
const createRoutes = require("./routes/index");

const app = express();

// Session store cho Keycloak
const memoryStore = new session.MemoryStore();
app.use(
  session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: true,
    store: memoryStore,
  })
);

// Khởi tạo Keycloak
const keycloak = initKeycloak(memoryStore);
app.use(keycloak.middleware());

// Middleware bảo mật & parse
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","DELETE","PATCH"], credentials: true }));
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(mongoSanitize());
app.use(xss());

if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

// Rate limit
const limiter = rateLimit({ max: 3000, windowMs: 60*60*1000, message: "Too many requests" });
app.use(limiter);

// Gắn routes
app.use("/api", createRoutes(keycloak));

module.exports = app;
