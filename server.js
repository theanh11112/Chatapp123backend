const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down ...");
  console.error(err);
  process.exit(1);
});

const app = require("./app");
const http = require("http");
const server = http.createServer(app);

// Kết nối DB
const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);

mongoose.connect(DB)
  .then(() => console.log("DB connection successful"))
  .catch(err => console.error("DB connection error:", err));

// Khởi tạo Socket.IO
const initSocket = require("./socket");
initSocket(server);

// Start server
const port = process.env.PORT || 8000;
server.listen(port, () => {
  console.log(`Server running on port ${port}...`);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! Shutting down ...");
  console.error(err);
  server.close(() => process.exit(1));
});
