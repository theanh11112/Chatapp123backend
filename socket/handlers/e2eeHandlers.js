// socket/handlers/e2eeHandlers.js - COMPLETE VERSION
const User = require("../../models/user");
const Message = require("../../models/message");
const Room = require("../../models/room");
const e2eeController = require("../../controllers/e2eeController");

console.log("🔐 [e2eeHandlers] Module loaded successfully");

function registerE2EEHandlers(socket, io) {
  if (!socket.user) {
    console.error("❌ [e2eeHandlers] Socket has no user object!");
    return;
  }

  const { keycloakId, username } = socket.user;

  console.log(`🔐 [e2eeHandlers] Registering E2EE handlers for ${username}`);

  // ==================== E2EE EVENT HANDLERS ====================

  // 1. ping - Health check
  socket.on("ping", (callback) => {
    console.log(`🏓 [e2eeHandlers - ${username}] ping received`);

    if (callback && typeof callback === "function") {
      callback({
        success: true,
        timestamp: new Date().toISOString(),
        userId: keycloakId,
        username: username,
        source: "e2eeHandlers",
      });
    }
  });

  // 2. get_e2ee_info - Get E2EE information
  socket.on("get_e2ee_info", async (callback) => {
    try {
      console.log(`📤 [e2eeHandlers - ${username}] get_e2ee_info received`);

      // Sử dụng controller để đảm bảo consistency
      const mockReq = { user: { keycloakId } };
      const mockRes = {
        status: () => mockRes,
        json: (data) => {
          if (callback) {
            callback({
              success: true,
              data: data.data || data,
            });
          }
        },
      };

      await e2eeController.getE2EEInfo(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] get_e2ee_info error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 3. request_e2ee_key - Request E2EE public key của user khác
  socket.on("request_e2ee_key", async (data, callback) => {
    try {
      const { userId } = data;

      if (!userId) {
        return callback?.({
          success: false,
          error: "userId is required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { userId },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              callback({
                success: true,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to get key",
              });
            }
          }
        },
      };

      await e2eeController.getUserE2EEPublicKey(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] request_e2ee_key error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 4. toggle_e2ee - Enable/disable E2EE
  socket.on("toggle_e2ee", async (data, callback) => {
    try {
      const { enabled } = data;

      if (typeof enabled !== "boolean") {
        return callback?.({
          success: false,
          error: "enabled (boolean) is required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { enabled },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              // Notify friends về status change
              notifyFriendsAboutE2EEStatus(keycloakId, username, enabled, io);

              callback({
                success: true,
                message: response.message,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to toggle E2EE",
              });
            }
          }
        },
      };

      await e2eeController.toggleE2EE(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] toggle_e2ee error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 5. update_e2ee_key - Cập nhật E2EE public key
  socket.on("update_e2ee_key", async (data, callback) => {
    try {
      const { publicKey, keyType = "ecdh" } = data;

      if (!publicKey) {
        return callback?.({
          success: false,
          error: "publicKey is required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { publicKey, keyType },
        app: { get: () => io }, // Truyền io instance
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              // Notify friends về key update
              notifyFriendsAboutKeyUpdate(
                keycloakId,
                username,
                response.data.fingerprint,
                keyType,
                io
              );

              callback({
                success: true,
                message: response.message,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to update key",
              });
            }
          }
        },
      };

      await e2eeController.updateE2EEPublicKey(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] update_e2ee_key error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 6. get_my_e2ee_keys - Lấy tất cả E2EE keys của user
  socket.on("get_my_e2ee_keys", async (callback) => {
    try {
      // Sử dụng controller function
      const mockReq = { user: { keycloakId } };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              callback({
                success: true,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to get keys",
              });
            }
          }
        },
      };

      await e2eeController.getAllMyE2EEKeys(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] get_my_e2ee_keys error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 7. set_active_key - Đặt key làm active
  socket.on("set_active_key", async (data, callback) => {
    try {
      const { fingerprint } = data;

      if (!fingerprint) {
        return callback?.({
          success: false,
          error: "fingerprint is required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { fingerprint },
        app: { get: () => io },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              // Notify friends về key change
              notifyFriendsAboutKeyChange(
                keycloakId,
                username,
                fingerprint,
                io
              );

              callback({
                success: true,
                message: response.message,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to set active key",
              });
            }
          }
        },
      };

      await e2eeController.setActiveE2EEKey(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] set_active_key error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 8. delete_e2ee_key - Xóa một key cụ thể
  socket.on("delete_e2ee_key", async (data, callback) => {
    try {
      const { fingerprint } = data;

      if (!fingerprint) {
        return callback?.({
          success: false,
          error: "fingerprint is required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { fingerprint },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              callback({
                success: true,
                message: response.message,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to delete key",
              });
            }
          }
        },
      };

      await e2eeController.deleteE2EEKey(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] delete_e2ee_key error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 9. verify_fingerprint - Verify key fingerprint
  socket.on("verify_fingerprint", async (data, callback) => {
    try {
      const { publicKey, expectedFingerprint } = data;

      if (!publicKey || !expectedFingerprint) {
        return callback?.({
          success: false,
          error: "publicKey and expectedFingerprint are required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        body: { publicKey, expectedFingerprint },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              callback({
                success: true,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to verify fingerprint",
              });
            }
          }
        },
      };

      await e2eeController.verifyKeyFingerprint(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] verify_fingerprint error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 10. initiate_key_exchange - Khởi tạo key exchange
  socket.on("initiate_key_exchange", async (data, callback) => {
    try {
      const { peerId } = data;

      if (!peerId) {
        return callback?.({
          success: false,
          error: "peerId is required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { peerId },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              // Gửi key exchange request tới peer qua socket
              io.to(peerId).emit("key_exchange_request", {
                from: keycloakId,
                username: username,
                publicKey: response.data.publicKey,
                fingerprint: response.data.fingerprint,
                exchangeId: response.data.exchangeId,
                timestamp: new Date(),
                source: "e2eeHandlers",
              });

              callback({
                success: true,
                message: response.message,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to initiate key exchange",
              });
            }
          }
        },
      };

      await e2eeController.initiateE2EEKeyExchange(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] initiate_key_exchange error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 11. confirm_key_exchange - Xác nhận key exchange
  socket.on("confirm_key_exchange", async (data, callback) => {
    try {
      const {
        exchangeId,
        peerId,
        publicKey,
        fingerprint,
        verified = false,
      } = data;

      if (!exchangeId || !peerId || !publicKey || !fingerprint) {
        return callback?.({
          success: false,
          error: "exchangeId, peerId, publicKey, and fingerprint are required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { exchangeId, peerId, publicKey, fingerprint, verified },
        app: { get: () => io },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              // Gửi confirmation tới peer
              if (verified) {
                io.to(peerId).emit("key_exchange_confirmed", {
                  from: keycloakId,
                  username: username,
                  exchangeId: exchangeId,
                  fingerprint: fingerprint,
                  timestamp: new Date(),
                  source: "e2eeHandlers",
                });
              }

              callback({
                success: true,
                message: response.message,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to confirm key exchange",
              });
            }
          }
        },
      };

      await e2eeController.confirmE2EEKeyExchange(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] confirm_key_exchange error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 12. send_encrypted_message - Gửi tin nhắn mã hóa
  socket.on("send_encrypted_message", async (data, callback) => {
    try {
      const {
        roomId,
        ciphertext,
        iv,
        keyId,
        algorithm = "AES-GCM-256",
        replyTo,
      } = data;

      if (!roomId || !ciphertext || !iv) {
        return callback?.({
          success: false,
          error: "roomId, ciphertext, and iv are required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { roomId, ciphertext, iv, keyId, algorithm, replyTo },
        app: { get: () => io },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              callback({
                success: true,
                message: response.message,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to send encrypted message",
              });
            }
          }
        },
      };

      await e2eeController.sendEncryptedMessage(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] send_encrypted_message error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  // 13. check_e2ee_status - Kiểm tra E2EE status của user khác
  socket.on("check_e2ee_status", async (data, callback) => {
    try {
      const { userId } = data;

      if (!userId) {
        return callback?.({
          success: false,
          error: "userId is required",
        });
      }

      // Sử dụng controller function
      const mockReq = {
        user: { keycloakId },
        body: { userId },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success") {
              callback({
                success: true,
                data: response.data,
              });
            } else {
              callback({
                success: false,
                error: response.message || "Failed to check E2EE status",
              });
            }
          }
        },
      };

      await e2eeController.checkE2EEStatus(mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [e2eeHandlers - ${username}] check_e2ee_status error:`,
        err.message
      );

      if (callback) {
        callback({
          success: false,
          error: err.message,
        });
      }
    }
  });

  console.log(`✅ [e2eeHandlers] All E2EE handlers registered for ${username}`);
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Notify friends about E2EE status change
 */
async function notifyFriendsAboutE2EEStatus(keycloakId, username, enabled, io) {
  try {
    const user = await User.findOne({ keycloakId });
    if (!user || !user.friends || user.friends.length === 0) return;

    user.friends.forEach((friendKeycloakId) => {
      io.to(friendKeycloakId).emit("friend_e2ee_status_changed", {
        userId: keycloakId,
        username: username,
        e2eeEnabled: enabled,
        timestamp: new Date(),
        source: "e2eeHandlers",
      });
    });

    console.log(
      `📢 Notified ${user.friends.length} friends about E2EE status change`
    );
  } catch (err) {
    console.error("❌ Error notifying friends about E2EE status:", err.message);
  }
}

/**
 * Notify friends about key update
 */
async function notifyFriendsAboutKeyUpdate(
  keycloakId,
  username,
  fingerprint,
  keyType,
  io
) {
  try {
    const user = await User.findOne({ keycloakId });
    if (!user || !user.friends || user.friends.length === 0) return;

    user.friends.forEach((friendKeycloakId) => {
      io.to(friendKeycloakId).emit("friend_e2ee_key_updated", {
        userId: keycloakId,
        username: username,
        fingerprint: fingerprint,
        keyType: keyType,
        timestamp: new Date(),
        source: "e2eeHandlers",
      });
    });

    console.log(`📢 Notified ${user.friends.length} friends about key update`);
  } catch (err) {
    console.error("❌ Error notifying friends about key update:", err.message);
  }
}

/**
 * Notify friends about key change
 */
async function notifyFriendsAboutKeyChange(
  keycloakId,
  username,
  fingerprint,
  io
) {
  try {
    const user = await User.findOne({ keycloakId });
    if (!user || !user.friends || user.friends.length === 0) return;

    user.friends.forEach((friendKeycloakId) => {
      io.to(friendKeycloakId).emit("friend_e2ee_key_changed", {
        userId: keycloakId,
        username: username,
        fingerprint: fingerprint,
        timestamp: new Date(),
        source: "e2eeHandlers",
      });
    });

    console.log(`📢 Notified ${user.friends.length} friends about key change`);
  } catch (err) {
    console.error("❌ Error notifying friends about key change:", err.message);
  }
}

module.exports = registerE2EEHandlers;
