// routes/userRoutes.js
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

  // 🆕 THÊM: Chỉ cho phép admin và moderator
  const allowAdminAndModerator = requireRole(...["admin", "moderator"]);

  // ====================== PROFILE ======================
  router.get(
    "/me",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getProfile
  );
  router.patch(
    "/update-me",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.updateProfile
  );

  // ====================== USER MANAGEMENT ======================
  router.get(
    "/get-users",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getAllUsers
  );

  router.get(
    "/search",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.searchUsers
  );

  // 🆕 THÊM: Cập nhật trạng thái user (chỉ admin/moderator)
  router.patch(
    "/update-status",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    userController.updateUserStatus
  );

  // 🆕 THÊM: Cập nhật vai trò user (chỉ admin/moderator)
  router.patch(
    "/update-role",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    userController.updateUserRole
  );

  // 🆕 THÊM: Cập nhật vai trò user (chỉ admin/moderator)
  router.patch(
    "/remove-role",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    userController.removeUserRole
  );

  // ====================== FRIEND MANAGEMENT ======================
  router.post(
    "/get-friends",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getFriends
  );

  router.post(
    "/get-nonfriends",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getNonFriendUsers
  );

  router.post(
    "/get-requests",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getFriendRequests
  );

  router.post(
    "/send-friend-request",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.sendFriendRequest
  );

  // routes/user.js
  router.post(
    "/cancel-friend-request",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.cancelFriendRequest
  );
  router.post(
    "/respond-friend-request",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.respondToFriendRequest
  );
  router.post(
    "/cancel-friend-request",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.cancelFriendRequest
  );

  // ====================== GROUP MANAGEMENT ======================
  // 🎯 CHỈ ADMIN/MODERATOR MỚI ĐƯỢC TẠO GROUP
  router.post(
    "/group/create",
    keycloak.protect(),
    syncUser,
    allowAdminAndModerator,
    userController.createGroup
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
  router.post(
    "/rooms/group",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getGroupRooms
  );
  router.post(
    "/creats/group",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.createGroup
  );

  // ====================== ROOM MESSAGES ======================
  router.post(
    "/rooms/messages",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getRoomMessages
  );

  // ====================== PINNED MESSAGES ======================
  router.post(
    "/messages/pinned",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getPinnedMessages
  );

  router.post(
    "/messages/pin",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.pinMessage
  );

  router.post(
    "/messages/unpin",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.unpinMessage
  );

  // ====================== SEND MESSAGE ======================
  router.post(
    "/message",
    keycloak.protect(),
    syncUser,
    allowAllSenders,
    userController.sendMessage
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
  router.post(
    "/call/history",
    keycloak.protect(),
    syncUser,
    allowUsers,
    userController.getCallHistory
  );

  return router;
};
