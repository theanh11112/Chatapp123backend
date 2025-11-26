// routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

// Tất cả endpoints nhận params qua body
router.post("/message", chatController.sendMessage);
router.post("/history", chatController.getChatHistory); // ✅ Body thay vì params
router.post("/clear", chatController.clearChatHistory); // ✅ Body thay vì params
router.post("/sessions", chatController.getUserSessions); // ✅ Body thay vì params
router.get("/health", chatController.healthCheck);

module.exports = router;
