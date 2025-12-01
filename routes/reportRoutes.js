// routes/reportRoutes.js
const express = require("express");
const reportController = require("../controllers/reportController");
const { requireRole, syncUserFromToken } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  // ---- Middleware đồng bộ user từ Keycloak ----
  const syncUser = async (req, res, next) => {
    try {
      if (!req.kauth?.grant) {
        return res
          .status(401)
          .json({ status: "fail", message: "Token không tồn tại" });
      }

      const tokenParsed = req.kauth.grant.access_token.content;

      req.user = await syncUserFromToken(tokenParsed);

      if (!req.user) {
        return res
          .status(401)
          .json({ status: "fail", message: "Không thể xác thực user" });
      }

      next();
    } catch (error) {
      console.error("❌ Sync user error:", error);
      return res
        .status(401)
        .json({ status: "error", message: "Token không hợp lệ" });
    }
  };

  const allowUsers = requireRole(...["user", "admin", "moderator"]);
  const allowAdminAndModerator = requireRole(...["admin", "moderator"]);

  // ====================== DASHBOARD ======================
  router.get(
    "/dashboard",
    keycloak.protect(), // ✅ Sử dụng giống userRoutes
    syncUser,
    allowUsers,
    reportController.getDashboard
  );

  // ====================== USER REPORT FUNCTIONS ======================

  // User gửi báo cáo mới
  router.post(
    "/create",
    keycloak.protect(),
    syncUser,
    allowUsers,
    reportController.createReport
  );

  // User xem danh sách báo cáo của mình
  router.post(
    "/my-reports",
    keycloak.protect(),
    syncUser,
    allowUsers,
    reportController.getUserReports
  );

  // User xem chi tiết báo cáo của mình
  router.post(
    "/my-report/detail",
    keycloak.protect(),
    syncUser,
    allowUsers,
    reportController.getUserReportDetail
  );

  // User cập nhật báo cáo (chỉ khi pending)
  router.put(
    "/my-report/update",
    keycloak.protect(),
    syncUser,
    allowUsers,
    reportController.updateUserReport
  );

  // ====================== ADMIN REPORT FUNCTIONS ======================

  // Admin lấy tất cả báo cáo
  router.post(
    "/admin/all",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    reportController.getAllReports
  );

  // Admin xem chi tiết báo cáo
  router.post(
    "/admin/detail",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    reportController.getReportDetail
  );

  // Admin assign báo cáo
  router.put(
    "/admin/assign",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    reportController.assignReport
  );

  // Admin cập nhật trạng thái báo cáo
  router.put(
    "/admin/update-status",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    reportController.updateReportStatus
  );

  // Admin thêm ghi chú giải quyết
  router.put(
    "/admin/add-resolution",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    reportController.addResolutionNote
  );

  // ====================== STATISTICS ======================

  // Thống kê báo cáo cơ bản
  router.get(
    "/stats",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    reportController.getReportStats
  );

  // Thống kê chi tiết
  router.post(
    "/stats/detailed",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    reportController.getDetailedReportStats
  );

  return router;
};
