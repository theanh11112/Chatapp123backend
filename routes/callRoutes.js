// routes/callRoutes.js - UPDATED VERSION WITH VIDEO CALL ROUTES
const express = require("express");
const callController = require("../controllers/callController");
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

  // ---- Role permissions ----
  const allowAllExceptBot = requireRole(
    ...["user", "admin", "moderator", "guest"]
  );

  // ====================== ZEGO TOKEN GENERATION ======================
  router.post(
    "/generate-zego-token",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.generateZegoToken
  );

  // ====================== AUDIO CALL MANAGEMENT ======================
  router.post(
    "/start-audio-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startAudioCall
  );

  router.post(
    "/start-group-audio-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startGroupAudioCall
  );

  // 🆕 THÊM VIDEO CALL ROUTES
  router.post(
    "/start-video-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startVideoCall
  );

  router.post(
    "/start-group-video-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startGroupVideoCall
  );

  // ====================== CALL STATUS MANAGEMENT ======================
  router.post(
    "/update-call-status",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.updateCallStatus
  );

  router.post(
    "/end-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.endCall
  );

  // ====================== CALL HISTORY ======================
  router.post(
    "/call-logs",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.getCallLogs
  );

  router.post(
    "/call-details",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.getCallDetails
  );

  router.post(
    "/ongoing-calls",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.getOngoingCalls
  );

  return router;
};
