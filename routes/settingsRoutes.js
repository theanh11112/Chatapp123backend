// routes/settingsRoutes.js
const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");

// ====================== SETTINGS MANAGEMENT ======================

// 🆕 Lấy tất cả cài đặt - SỬA THÀNH POST
router.post("/get-settings", settingsController.getSettings);

// 🆕 Cập nhật cài đặt thông báo
router.put("/notifications", settingsController.updateNotificationSettings);

// 🆕 Cập nhật cài đặt bảo mật
router.put("/privacy", settingsController.updatePrivacySettings);

// 🆕 Cập nhật cài đặt chung
router.put("/general", settingsController.updateGeneralSettings);

// 🆕 Cập nhật cài đặt chat
router.put("/chat", settingsController.updateChatSettings);

// 🆕 Reset tất cả cài đặt
router.post("/reset", settingsController.resetSettings);

module.exports = router;
