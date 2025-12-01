// controllers/notificationController.js
const Notification = require("../models/Notification");

// -------------------- Dashboard --------------------
exports.getDashboard = (req, res) => {
  res.status(200).json({
    message:
      "🔔 Chào mừng đến Quản lý Thông báo! Đây là khu vực quản lý tất cả thông báo hệ thống.",
  });
};

// -------------------- Quản lý Thông báo Admin --------------------

// Lấy tất cả thông báo cho admin
exports.getAllAdminNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, isRead } = req.body;

    const filter = {};

    // Lọc theo type nếu có
    if (type && type !== "all") {
      filter.type = type;
    }

    // Lọc theo trạng thái đọc nếu có
    if (isRead !== undefined) {
      filter.isRead = isRead === "true";
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(filter);

    res.status(200).json({
      status: "success",
      data: notifications,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Đánh dấu thông báo đã đọc
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.body;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy thông báo",
      });
    }

    res.status(200).json({
      status: "success",
      data: notification,
      message: "Đã đánh dấu thông báo là đã đọc",
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Xóa thông báo
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.body;

    const notification = await Notification.findByIdAndDelete(notificationId);

    if (!notification) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy thông báo",
      });
    }

    res.status(200).json({
      status: "success",
      message: "Đã xóa thông báo thành công",
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Tạo thông báo hệ thống
exports.createSystemNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type = "info",
      priority = "medium",
      recipientType = "all",
      recipientIds = [],
      source = "System",
      actionUrl,
      metadata = {},
      expiresAt,
      createdBy = "system", // Mặc định là system nếu không có user
    } = req.body;

    const notification = new Notification({
      title,
      message,
      type,
      priority,
      recipientType,
      recipientIds,
      source,
      actionUrl,
      metadata,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy,
    });

    await notification.save();

    res.status(201).json({
      status: "success",
      data: notification,
      message: "Đã tạo thông báo thành công",
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- Quản lý Thông báo User --------------------

// Lấy thông báo cho người dùng thông thường
exports.getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, userRoles = [] } = req.body;

    const filter = {
      $or: [
        { recipientType: "all" },
        { recipientType: "user", recipientIds: userId },
        {
          recipientType: "role_based",
          recipientIds: { $in: userRoles },
        },
      ],
      $and: [
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
          ],
        },
      ],
    };

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1, priority: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(filter);

    // Đếm số thông báo chưa đọc
    const unreadCount = await Notification.countDocuments({
      ...filter,
      isRead: false,
    });

    res.status(200).json({
      status: "success",
      data: notifications,
      unreadCount,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Đánh dấu tất cả thông báo là đã đọc
// controllers/notificationController.js - SỬA HÀM markAllNotificationsAsRead
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const { userId, userRoles = [] } = req.body;

    console.log("🔄 Mark all as read request:", { userId, userRoles });

    // 🆕 QUAN TRỌNG: Nếu là admin, đánh dấu TẤT CẢ thông báo là đã đọc
    const isAdmin = userRoles.includes("admin");

    let filter;
    if (isAdmin) {
      // Admin: đánh dấu tất cả thông báo trong hệ thống
      filter = { isRead: false };
      console.log("👑 Admin marking ALL notifications as read");
    } else {
      // User thường: chỉ đánh dấu thông báo của họ
      filter = {
        $or: [
          { recipientType: "all" },
          { recipientType: "user", recipientIds: userId },
          {
            recipientType: "role_based",
            recipientIds: { $in: userRoles },
          },
        ],
        isRead: false,
      };
      console.log("👤 User marking personal notifications as read");
    }

    const result = await Notification.updateMany(filter, { isRead: true });

    console.log("✅ Mark all as read result:", {
      modifiedCount: result.modifiedCount,
      isAdmin: isAdmin,
    });

    res.status(200).json({
      status: "success",
      message: `Đã đánh dấu ${result.modifiedCount} thông báo là đã đọc`,
      modifiedCount: result.modifiedCount,
      isAdmin: isAdmin,
    });
  } catch (err) {
    console.error("❌ Error marking all as read:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Lấy số lượng thông báo chưa đọc
exports.getUnreadNotificationsCount = async (req, res) => {
  try {
    const { userId, userRoles = [] } = req.body;

    const filter = {
      $or: [
        { recipientType: "all" },
        { recipientType: "user", recipientIds: userId },
        {
          recipientType: "role_based",
          recipientIds: { $in: userRoles },
        },
      ],
      isRead: false,
      $and: [
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
          ],
        },
      ],
    };

    const unreadCount = await Notification.countDocuments(filter);

    res.status(200).json({
      status: "success",
      data: { unreadCount },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- Thống kê --------------------

// Thống kê cơ bản thông báo
// controllers/notificationController.js - THÊM STATS MỞ RỘNG
exports.getNotificationStats = async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments();
    const unreadNotifications = await Notification.countDocuments({
      isRead: false,
    });
    const readNotifications = await Notification.countDocuments({
      isRead: true,
    });

    // Thống kê theo type
    const infoCount = await Notification.countDocuments({ type: "info" });
    const warningCount = await Notification.countDocuments({ type: "warning" });
    const errorCount = await Notification.countDocuments({ type: "error" });
    const successCount = await Notification.countDocuments({ type: "success" });

    // 🆕 Thống kê theo thời gian
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = await Notification.countDocuments({
      createdAt: { $gte: today },
    });

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisWeekCount = await Notification.countDocuments({
      createdAt: { $gte: thisWeek },
    });

    res.status(200).json({
      status: "success",
      data: {
        total: totalNotifications,
        unread: unreadNotifications,
        read: readNotifications,
        todayCount,
        thisWeekCount,
        byType: {
          info: infoCount,
          warning: warningCount,
          error: errorCount,
          success: successCount,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
// Xem thống kê chi tiết
exports.getDetailedNotificationStats = async (req, res) => {
  try {
    const { days = 30 } = req.body;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Tổng số thông báo trong khoảng thời gian
    const totalInPeriod = await Notification.countDocuments({
      createdAt: { $gte: startDate },
    });

    // Thống kê theo ngày
    const dailyStats = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
          read: {
            $sum: { $cond: [{ $eq: ["$isRead", true] }, 1, 0] },
          },
          unread: {
            $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Thống kê theo type
    const typeStats = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    // Thống kê theo priority
    const priorityStats = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        period: `${days} ngày`,
        totalInPeriod,
        dailyStats,
        typeStats,
        priorityStats,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
