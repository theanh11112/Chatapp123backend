// routes/notifications.js
const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");

// ==================== DASHBOARD ====================

// 🏠 Dashboard thông báo
router.get("/dashboard", notificationController.getDashboard);

// ==================== ADMIN ROUTES ====================

// 📋 Lấy danh sách thông báo cho admin
router.post(
  "/admin/notifications",
  notificationController.getAllAdminNotifications
);

// ✅ Đánh dấu thông báo đã đọc (admin)
router.put(
  "/admin/notifications/mark-read",
  notificationController.markNotificationAsRead
);

// 🗑️ Xóa thông báo (admin)
router.delete(
  "/admin/notifications/delete",
  notificationController.deleteNotification
);

// ➕ Tạo thông báo hệ thống (cho admin)
router.post(
  "/admin/notifications/create",
  notificationController.createSystemNotification
);

// ==================== USER ROUTES ====================

// 📱 Lấy thông báo cho người dùng thông thường
router.post("/notifications/user", notificationController.getUserNotifications);

// ✅ Đánh dấu thông báo đã đọc (user)
router.put(
  "/notifications/mark-read",
  notificationController.markNotificationAsRead
);

// ✅ Đánh dấu tất cả thông báo là đã đọc (user)
router.put(
  "/notifications/mark-all-read",
  notificationController.markAllNotificationsAsRead
);

// 🔢 Lấy số lượng thông báo chưa đọc (user)
router.post(
  "/notifications/unread-count",
  notificationController.getUnreadNotificationsCount
);

// ==================== STATISTICS ====================

// 📊 Thống kê cơ bản thông báo
router.get("/notifications/stats", notificationController.getNotificationStats);

// 📈 Thống kê chi tiết thông báo
router.post(
  "/notifications/detailed-stats",
  notificationController.getDetailedNotificationStats
);

module.exports = router;
