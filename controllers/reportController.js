// controllers/reportController.js
const Report = require("../models/Report");

// -------------------- Dashboard --------------------
exports.getDashboard = (req, res) => {
  res.status(200).json({
    message:
      "📊 Chào mừng đến Quản lý Báo cáo! Đây là khu vực quản lý tất cả báo cáo từ người dùng.",
  });
};

// -------------------- User Report Functions --------------------

// User gửi báo cáo mới - UPDATED
exports.createReport = async (req, res) => {
  try {
    const {
      title,
      description,
      type = "other",
      priority = "medium",
      category = "general",
      attachments = [],
      metadata = {},
    } = req.body;

    // Lấy thông tin từ token thay vì body
    const keycloakId = req.user.keycloakId;
    const email = req.user.email;

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "Không tìm thấy thông tin user",
      });
    }

    // Validation
    if (!title || !description) {
      return res.status(400).json({
        status: "error",
        message: "Tiêu đề và mô tả là bắt buộc",
      });
    }

    if (title.length > 200) {
      return res.status(400).json({
        status: "error",
        message: "Tiêu đề không được vượt quá 200 ký tự",
      });
    }

    if (description.length > 2000) {
      return res.status(400).json({
        status: "error",
        message: "Mô tả không được vượt quá 2000 ký tự",
      });
    }

    const report = new Report({
      title,
      description,
      type,
      priority,
      category,
      reportedBy: keycloakId,
      reportedByEmail: email,
      attachments,
      metadata,
    });

    await report.save();

    // TODO: Gửi thông báo cho admin về báo cáo mới
    // await createAdminNotification(report);

    res.status(201).json({
      status: "success",
      data: report,
      message:
        "Đã gửi báo cáo thành công. Chúng tôi sẽ xem xét và phản hồi sớm nhất.",
    });
  } catch (err) {
    console.error("❌ Create report error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// User xem danh sách báo cáo của mình - UPDATED
exports.getUserReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.body;

    // Lấy keycloakId từ req.user
    const keycloakId = req.user.keycloakId;

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "Không tìm thấy thông tin user",
      });
    }

    const filter = { reportedBy: keycloakId };

    // Lọc theo status nếu có
    if (status && status !== "all") {
      filter.status = status;
    }

    // Lọc theo type nếu có
    if (type && type !== "all") {
      filter.type = type;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reports = await Report.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .select("-metadata -resolution.resolvedBy"); // Ẩn một số field nhạy cảm

    const total = await Report.countDocuments(filter);

    // Thống kê trạng thái
    const statusStats = await Report.aggregate([
      { $match: { reportedBy: keycloakId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: reports,
      stats: statusStats,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum,
      },
    });
  } catch (err) {
    console.error("❌ Get user reports error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// User xem chi tiết báo cáo của mình - UPDATED
exports.getUserReportDetail = async (req, res) => {
  try {
    const { reportId } = req.body;
    const keycloakId = req.user.keycloakId;

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "Không tìm thấy thông tin user",
      });
    }

    if (!reportId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu reportId",
      });
    }

    const report = await Report.findOne({
      _id: reportId,
      reportedBy: keycloakId,
    });

    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy báo cáo",
      });
    }

    res.status(200).json({
      status: "success",
      data: report,
    });
  } catch (err) {
    console.error("❌ Get user report detail error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// User cập nhật báo cáo (chỉ khi pending) - UPDATED
exports.updateUserReport = async (req, res) => {
  try {
    const { reportId, title, description, type, priority, category } = req.body;

    const keycloakId = req.user.keycloakId;

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "Không tìm thấy thông tin user",
      });
    }

    if (!reportId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu reportId",
      });
    }

    const report = await Report.findOne({
      _id: reportId,
      reportedBy: keycloakId,
    });

    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy báo cáo",
      });
    }

    // Chỉ cho phép cập nhật khi report còn pending
    if (report.status !== "pending") {
      return res.status(400).json({
        status: "error",
        message: "Chỉ có thể cập nhật báo cáo khi đang ở trạng thái chờ xử lý",
      });
    }

    // Validation
    if (title && title.length > 200) {
      return res.status(400).json({
        status: "error",
        message: "Tiêu đề không được vượt quá 200 ký tự",
      });
    }

    if (description && description.length > 2000) {
      return res.status(400).json({
        status: "error",
        message: "Mô tả không được vượt quá 2000 ký tự",
      });
    }

    // Cập nhật các field được phép
    const allowedUpdates = { title, description, type, priority, category };
    let hasUpdates = false;

    Object.keys(allowedUpdates).forEach((key) => {
      if (allowedUpdates[key] !== undefined) {
        report[key] = allowedUpdates[key];
        hasUpdates = true;
      }
    });

    if (!hasUpdates) {
      return res.status(400).json({
        status: "error",
        message: "Không có dữ liệu nào để cập nhật",
      });
    }

    await report.save();

    res.status(200).json({
      status: "success",
      data: report,
      message: "Đã cập nhật báo cáo thành công",
    });
  } catch (err) {
    console.error("❌ Update user report error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- Admin Report Functions --------------------

// Admin lấy tất cả báo cáo - UPDATED
exports.getAllReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      type,
      priority,
      category,
      assignedTo,
      search,
    } = req.body;

    const filter = {};

    // Lọc theo các điều kiện
    if (status && status !== "all") filter.status = status;
    if (type && type !== "all") filter.type = type;
    if (priority && priority !== "all") filter.priority = priority;
    if (category && category !== "all") filter.category = category;
    if (assignedTo && assignedTo !== "all") filter.assignedTo = assignedTo;

    // Tìm kiếm theo title hoặc description
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const reports = await Report.find(filter)
      .sort({ createdAt: -1, priority: -1 })
      .limit(limitNum)
      .skip(skip);
    // Note: populate sẽ không hoạt động nếu không có User model
    // .populate("reportedBy", "email username")
    // .populate("assignedTo", "email username");

    const total = await Report.countDocuments(filter);

    res.status(200).json({
      status: "success",
      data: reports,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum,
      },
    });
  } catch (err) {
    console.error("❌ Get all reports error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Admin xem chi tiết báo cáo - UPDATED
exports.getReportDetail = async (req, res) => {
  try {
    const { reportId } = req.body;

    if (!reportId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu reportId",
      });
    }

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy báo cáo",
      });
    }

    res.status(200).json({
      status: "success",
      data: report,
    });
  } catch (err) {
    console.error("❌ Get report detail error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Admin assign báo cáo cho mình hoặc admin khác - UPDATED
exports.assignReport = async (req, res) => {
  try {
    const { reportId, assignedTo } = req.body;
    const adminKeycloakId = req.user.keycloakId;

    if (!reportId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu reportId",
      });
    }

    if (!assignedTo) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu assignedTo",
      });
    }

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy báo cáo",
      });
    }

    report.assignedTo = assignedTo;
    if (report.status === "pending") {
      report.status = "in_progress";
    }

    await report.save();

    // TODO: Gửi thông báo cho user về việc báo cáo được assign
    // await createUserNotification(report);

    res.status(200).json({
      status: "success",
      data: report,
      message: `Đã assign báo cáo cho ${assignedTo}`,
    });
  } catch (err) {
    console.error("❌ Assign report error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Admin cập nhật trạng thái báo cáo - UPDATED
exports.updateReportStatus = async (req, res) => {
  try {
    const { reportId, status, resolutionNote } = req.body;
    const adminKeycloakId = req.user.keycloakId;

    if (!reportId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu reportId",
      });
    }

    if (!status) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu status",
      });
    }

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy báo cáo",
      });
    }

    report.status = status;

    // Nếu là trạng thái resolved/rejected/closed thì cập nhật resolution
    if (["resolved", "rejected", "closed"].includes(status)) {
      report.resolution = {
        resolvedBy: adminKeycloakId,
        resolvedAt: new Date(),
        resolutionNote: resolutionNote || "Đã xử lý",
      };

      // Cập nhật thời gian đóng nếu chưa có
      if (!report.closedAt) {
        report.closedAt = new Date();
      }
    }

    // Cập nhật thời gian phản hồi đầu tiên nếu chưa có
    if (!report.firstResponseAt && status !== "pending") {
      report.firstResponseAt = new Date();
    }

    await report.save();

    // TODO: Gửi thông báo cho user về việc cập nhật trạng thái
    // await createUserNotification(report);

    res.status(200).json({
      status: "success",
      data: report,
      message: `Đã cập nhật trạng thái báo cáo thành ${status}`,
    });
  } catch (err) {
    console.error("❌ Update report status error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Admin thêm ghi chú giải quyết - UPDATED
exports.addResolutionNote = async (req, res) => {
  try {
    const { reportId, resolutionNote } = req.body;
    const adminKeycloakId = req.user.keycloakId;

    if (!reportId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu reportId",
      });
    }

    if (!resolutionNote) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu resolutionNote",
      });
    }

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy báo cáo",
      });
    }

    report.resolution = {
      resolvedBy: adminKeycloakId,
      resolvedAt: new Date(),
      resolutionNote,
    };

    if (report.status !== "resolved" && report.status !== "closed") {
      report.status = "resolved";
    }

    // Cập nhật thời gian đóng nếu chưa có
    if (!report.closedAt) {
      report.closedAt = new Date();
    }

    await report.save();

    res.status(200).json({
      status: "success",
      data: report,
      message: "Đã thêm ghi chú giải quyết",
    });
  } catch (err) {
    console.error("❌ Add resolution note error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- Thống kê --------------------

// Thống kê báo cáo cho admin
exports.getReportStats = async (req, res) => {
  try {
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: "pending" });
    const inProgressReports = await Report.countDocuments({
      status: "in_progress",
    });
    const resolvedReports = await Report.countDocuments({ status: "resolved" });
    const rejectedReports = await Report.countDocuments({ status: "rejected" });
    const closedReports = await Report.countDocuments({ status: "closed" });

    // Thống kê theo type
    const typeStats = await Report.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    // Thống kê theo priority
    const priorityStats = await Report.aggregate([
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);

    // Thống kê theo category
    const categoryStats = await Report.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    // Thống kê theo status
    const statusStats = await Report.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        total: totalReports,
        byStatus: {
          pending: pendingReports,
          in_progress: inProgressReports,
          resolved: resolvedReports,
          rejected: rejectedReports,
          closed: closedReports,
        },
        byType: typeStats,
        byPriority: priorityStats,
        byCategory: categoryStats,
        statusBreakdown: statusStats,
      },
    });
  } catch (err) {
    console.error("❌ Get report stats error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Thống kê chi tiết
exports.getDetailedReportStats = async (req, res) => {
  try {
    const { days = 30 } = req.body;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Thống kê theo ngày
    const dailyStats = await Report.aggregate([
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
          total: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          in_progress: {
            $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Thời gian xử lý trung bình (tính bằng giờ)
    const avgResolutionTime = await Report.aggregate([
      {
        $match: {
          status: { $in: ["resolved", "closed"] },
          "resolution.resolvedAt": { $exists: true },
          createdAt: { $gte: startDate },
        },
      },
      {
        $project: {
          resolutionTimeHours: {
            $divide: [
              { $subtract: ["$resolution.resolvedAt", "$createdAt"] },
              1000 * 60 * 60, // Chuyển từ milliseconds sang hours
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTimeHours: { $avg: "$resolutionTimeHours" },
          minTimeHours: { $min: "$resolutionTimeHours" },
          maxTimeHours: { $max: "$resolutionTimeHours" },
        },
      },
    ]);

    // Top categories
    const topCategories = await Report.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    const result = avgResolutionTime[0] || {};

    res.status(200).json({
      status: "success",
      data: {
        period: `${days} ngày`,
        totalInPeriod: dailyStats.reduce((sum, day) => sum + day.total, 0),
        dailyStats,
        resolutionTime: {
          avgHours: Math.round(result.avgTimeHours * 100) / 100 || 0,
          minHours: Math.round(result.minTimeHours * 100) / 100 || 0,
          maxHours: Math.round(result.maxTimeHours * 100) / 100 || 0,
        },
        topCategories,
      },
    });
  } catch (err) {
    console.error("❌ Get detailed report stats error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// User xóa báo cáo của mình (chỉ khi pending) - NEW
exports.deleteUserReport = async (req, res) => {
  try {
    const { reportId } = req.body;
    const keycloakId = req.user.keycloakId;

    if (!keycloakId) {
      return res.status(400).json({
        status: "error",
        message: "Không tìm thấy thông tin user",
      });
    }

    if (!reportId) {
      return res.status(400).json({
        status: "error",
        message: "Thiếu reportId",
      });
    }

    const report = await Report.findOne({
      _id: reportId,
      reportedBy: keycloakId,
    });

    if (!report) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy báo cáo",
      });
    }

    // Chỉ cho phép xóa khi report còn pending
    if (report.status !== "pending") {
      return res.status(400).json({
        status: "error",
        message: "Chỉ có thể xóa báo cáo khi đang ở trạng thái chờ xử lý",
      });
    }

    await Report.findByIdAndDelete(reportId);

    res.status(200).json({
      status: "success",
      message: "Đã xóa báo cáo thành công",
    });
  } catch (err) {
    console.error("❌ Delete user report error:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};
