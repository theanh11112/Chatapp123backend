const express = require("express");
const userController = require("../controllers/userController");
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
  const allowAllSenders = requireRole(...["user", "admin", "moderator", "bot"]);

  // ====================== PROFILE ======================
  router.get(
    "/me",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getProfile
  );
  router.patch(
    "/me",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.updateProfile
  );

  // ====================== DIRECT CONVERSATIONS ======================
  router.get(
    "/conversations/direct",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getDirectConversations
  );
  router.post(
    "/conversations/direct",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getDirectConversationById
  );

  // ====================== GROUP ROOMS ======================
  router.get(
    "/rooms/group",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getGroupRooms
  );
  router.post(
    "/rooms/group",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getGroupRooms
  );

  // ====================== ROOM MESSAGES ======================
  router.post(
    "/rooms/messages",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getRoomMessages
  );

  // ====================== SEND MESSAGE ======================
  router.post(
    "/message",
    keycloak.protect(),
    syncUser,
    allowAllSenders,
    userController.sendMessage
  );

  // ====================== DELETE MESSAGE ======================

  router.delete(
    "/conversations/messages",
    keycloak.protect(),
    syncUser,
    allowAllSenders,
    userController.deleteDirectMessage
  );

  // ====================== DELETE MESSAGE DIRECT ======================
  router.delete(
    "/rooms/messages",
    keycloak.protect(),
    syncUser,
    allowAllSenders,
    userController.deleteGroupMessage
  );

  // ====================== ROOM MANAGEMENT ======================
  router.get(
    "/rooms",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getUserRooms
  );

  router.post(
    "/room/create",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.createPrivateRoom
  );

  // ====================== FRIEND LIST ======================
  router.get(
    "/friends",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getFriends
  );

  // ====================== CALL FEATURE ======================
  router.post(
    "/call",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.createCall
  );
  router.patch(
    "/call/end",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.endCall
  );
  router.get(
    "/call/history",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getCallHistory
  );

  return router;
};
