// routes/e2eeRoutes.js
const express = require("express");
const e2eeController = require("../controllers/e2eeController");
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

  // ====================== E2EE KEY MANAGEMENT ======================

  // 🆕 Lấy thông tin E2EE của chính mình
  router.get(
    "/info",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.getE2EEInfo
  );

  // 🆕 Cập nhật E2EE public key
  router.post(
    "/update-key",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.updateE2EEPublicKey
  );

  // 🆕 Lấy E2EE public key của user khác
  router.post(
    "/public-key",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.getUserE2EEPublicKey
  );

  // 🆕 Lấy tất cả E2EE keys của user
  router.get(
    "/my-keys",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.getAllMyE2EEKeys
  );

  // 🆕 Enable/disable E2EE
  router.patch(
    "/toggle",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.toggleE2EE
  );

  // 🆕 Đặt một key làm active
  router.post(
    "/set-active-key",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.setActiveE2EEKey
  );

  // 🆕 Xóa một key cụ thể
  router.post(
    "/delete-key",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.deleteE2EEKey
  );

  // ====================== E2EE KEY EXCHANGE ======================

  // 🆕 Khởi tạo E2EE key exchange
  router.post(
    "/initiate-exchange",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.initiateE2EEKeyExchange
  );

  // 🆕 Xác nhận E2EE key exchange
  router.post(
    "/confirm-exchange",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.confirmE2EEKeyExchange
  );

  // 🆕 Kiểm tra E2EE status của user khác
  router.post(
    "/check-status",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.checkE2EEStatus
  );

  // ====================== E2EE MESSAGE HANDLING ======================

  // 🆕 Gửi encrypted message
  router.post(
    "/message/encrypted",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.sendEncryptedMessage
  );

  // 🆕 Lấy encrypted messages của room
  router.post(
    "/messages/encrypted",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.getEncryptedMessages
  );

  // ====================== E2EE UTILITIES ======================

  // 🆕 Generate key pair (hướng dẫn cho client)
  router.get(
    "/generate-keypair",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.generateKeyPair
  );

  // 🆕 Verify key fingerprint
  router.post(
    "/verify-fingerprint",
    keycloak.protect(),
    syncUser,
    allowUsers,
    e2eeController.verifyKeyFingerprint
  );

  return router;
};
