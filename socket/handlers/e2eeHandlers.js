// socket/handlers/e2eeHandlers.js - COMPLETE FIXED VERSION
const User = require("../../models/user");
const Message = require("../../models/message");
const Room = require("../../models/room");

// ==================== IMPORT CONTROLLER WITH ERROR HANDLING ====================
let e2eeController = null;
try {
  e2eeController = require("../../controllers/e2eeController");
  console.log("✅ [e2eeHandlers] e2eeController imported successfully");

  // Verify essential functions exist
  const requiredFunctions = [
    "toggleE2EE",
    "getE2EEInfo",
    "updateE2EEPublicKey",
    "getUserE2EEPublicKey",
    "getAllMyE2EEKeys",
    "setActiveE2EEKey",
    "deleteE2EEKey",
    "verifyKeyFingerprint",
    "initiateE2EEKeyExchange",
    "confirmE2EEKeyExchange",
    "checkE2EEStatus",
    "sendEncryptedMessage",
    "getEncryptedMessages", // THÊM VÀO
  ];

  const missingFunctions = requiredFunctions.filter(
    (fn) => !e2eeController[fn]
  );
  if (missingFunctions.length > 0) {
    console.warn(
      `⚠️ [e2eeHandlers] Missing functions in controller:`,
      missingFunctions
    );
  } else {
    console.log(
      "✅ [e2eeHandlers] All required controller functions available"
    );
  }
} catch (err) {
  console.error(
    "❌ [e2eeHandlers] Failed to import e2eeController:",
    err.message
  );
  console.error("Stack:", err.stack);
  e2eeController = null;
}

console.log("🔐 [e2eeHandlers] Module loaded successfully");

function registerE2EEHandlers(socket, io) {
  if (!socket.user) {
    console.error("❌ [e2eeHandlers] Socket has no user object!");
    return;
  }

  const { keycloakId, username } = socket.user;

  console.log(`🔐 [e2eeHandlers] Registering E2EE handlers for ${username}`);

  // ==================== DEBUG: CHECK EXISTING HANDLERS ====================
  console.log(`[DEBUG - ${username}] Existing handler counts before cleanup:`);
  const eventsToCheck = [
    "ping",
    "get_e2ee_info",
    "get_my_e2ee_keys",
    "toggle_e2ee",
  ];
  eventsToCheck.forEach((event) => {
    console.log(`   ${event}: ${socket.listeners(event).length} listeners`);
  });

  // ==================== CLEANUP EXISTING HANDLERS ====================
  // Remove any existing handlers to avoid conflicts
  const eventsToRemove = [
    "ping",
    "get_e2ee_info",
    "get_my_e2ee_keys",
    "toggle_e2ee",
    "update_e2ee_key",
    "request_e2ee_key",
    "set_active_key",
    "delete_e2ee_key",
    "verify_fingerprint",
    "initiate_key_exchange",
    "confirm_key_exchange",
    "send_encrypted_message",
    "check_e2ee_status",
    "get_encrypted_messages", // THÊM VÀO
    "test_direct_message", // THÊM VÀO
  ];

  eventsToRemove.forEach((event) => {
    const listenerCount = socket.listeners(event).length;
    if (listenerCount > 0) {
      console.log(
        `⚠️ [${username}] Removing ${listenerCount} existing listeners for ${event}`
      );
      socket.removeAllListeners(event);
    }
  });

  console.log(
    `[DEBUG - ${username}] After cleanup - Ping listeners: ${
      socket.listeners("ping").length
    }`
  );

  // ==================== HELPER FUNCTIONS ====================

  /**
   * Safe controller call wrapper
   */
  const callController = async (
    controllerFn,
    reqData,
    callback,
    options = {}
  ) => {
    try {
      if (!e2eeController || !e2eeController[controllerFn]) {
        const errorMsg = `Controller function '${controllerFn}' not available`;
        console.error(`❌ [${username}] ${errorMsg}`);
        if (callback) {
          callback({
            success: false,
            error: errorMsg,
          });
        }
        return;
      }

      const mockReq = {
        user: { keycloakId },
        body: reqData,
        app: { get: (key) => (key === "io" ? io : null) },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          if (callback) {
            if (response.status === "success" || response.success === true) {
              // Execute post-success actions if provided
              if (
                options.onSuccess &&
                typeof options.onSuccess === "function"
              ) {
                options.onSuccess(response);
              }

              callback({
                success: true,
                message: response.message,
                data: response.data || response,
              });
            } else {
              callback({
                success: false,
                error: response.message || response.error || "Operation failed",
                data: response.data,
              });
            }
          }
        },
      };

      await e2eeController[controllerFn](mockReq, mockRes);
    } catch (err) {
      console.error(
        `❌ [${username}] Controller error for ${controllerFn}:`,
        err.message
      );
      console.error("Stack:", err.stack);

      if (callback) {
        callback({
          success: false,
          error: `Server error: ${err.message}`,
        });
      }
    }
  };

  /**
   * Validate required fields
   */
  const validateFields = (data, requiredFields, callback) => {
    for (const field of requiredFields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ""
      ) {
        const errorMsg = `${field} is required`;
        console.error(`❌ [${username}] Validation error: ${errorMsg}`);
        if (callback) {
          callback({ success: false, error: errorMsg });
        }
        return false;
      }
    }
    return true;
  };

  /**
   * Validate callback function
   */
  const validateCallback = (callback) => {
    if (!callback || typeof callback !== "function") {
      console.warn(`⚠️ [${username}] Event called without callback`);
      return false;
    }
    return true;
  };

  // ==================== E2EE EVENT HANDLERS ====================

  // 1. ping - Health check
  socket.on("ping", (callback) => {
    console.log(`🏓 [e2eeHandlers - ${username}] ping received`);

    if (!validateCallback(callback)) return;

    try {
      const response = {
        success: true,
        message: "pong from e2eeHandlers",
        timestamp: new Date().toISOString(),
        userId: keycloakId,
        username: username,
        source: "e2eeHandlers",
        handlerVersion: "2.0",
      };

      console.log(`🏓 [${username}] Sending ping response`);
      callback(response);
    } catch (err) {
      console.error(`❌ [${username}] Ping handler error:`, err.message);
      callback({ success: false, error: "Internal server error" });
    }
  });

  console.log(`✅ [${username}] Ping handler registered`);

  // 2. get_e2ee_info - Get E2EE information
  // 2. get_e2ee_info - Get E2EE information
  socket.on("get_e2ee_info", async (callback) => {
    console.log(`📤 [e2eeHandlers - ${username}] get_e2ee_info received`);

    // ✅ FIX: Luôn trả về response ngay cả khi không có callback
    const sendResponse = (response) => {
      if (callback && typeof callback === "function") {
        callback(response);
        console.log("22222", response);
      } else {
        // Nếu không có callback, emit response qua socket
        console.warn(
          `⚠️ [${username}] No callback, emitting response via socket`
        );
        socket.emit("e2ee_info_response", response);
      }
    };

    // If controller not available, return debug response
    if (!e2eeController || !e2eeController.getE2EEInfo) {
      console.warn(
        `⚠️ [${username}] Controller not available, sending debug response`
      );
      const debugResponse = {
        success: true,
        data: {
          keycloakId: keycloakId,
          username: username,
          e2eeEnabled: false,
          message: "E2EE controller not available - debug mode",
          timestamp: new Date().toISOString(),
          source: "e2eeHandlers-debug",
          handlerVersion: "2.0",
        },
      };
      sendResponse(debugResponse);
      return;
    }

    // Dùng controller
    try {
      const mockReq = {
        user: { keycloakId },
        body: {},
        app: { get: (key) => (key === "io" ? io : null) },
      };

      const mockRes = {
        status: () => mockRes,
        json: (response) => {
          sendResponse({
            success: response.status === "success" || response.success === true,
            message: response.message,
            data: response.data || response,
          });
        },
      };

      await e2eeController.getE2EEInfo(mockReq, mockRes);
    } catch (err) {
      console.error(`❌ [${username}] Error in get_e2ee_info:`, err.message);
      sendResponse({
        success: false,
        error: `Server error: ${err.message}`,
      });
    }
  });
  // 3. request_e2ee_key - Request E2EE public key của user khác
  socket.on("request_e2ee_key", async (data, callback) => {
    console.log(
      `🔑 [e2eeHandlers - ${username}] request_e2ee_key received:`,
      data
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["userId"], callback)) return;

    await callController(
      "getUserE2EEPublicKey",
      { userId: data.userId },
      callback
    );
  });

  // 4. toggle_e2ee - Enable/disable E2EE
  socket.on("toggle_e2ee", async (data, callback) => {
    console.log(`🔧 [e2eeHandlers - ${username}] toggle_e2ee received:`, data);

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["enabled"], callback)) return;

    if (typeof data.enabled !== "boolean") {
      callback({ success: false, error: "enabled must be a boolean" });
      return;
    }

    const onSuccess = (response) => {
      // Notify friends about status change
      notifyFriendsAboutE2EEStatus(
        keycloakId,
        username,
        data.enabled,
        io
      ).catch((err) => console.error(`Failed to notify friends:`, err.message));
    };

    await callController("toggleE2EE", { enabled: data.enabled }, callback, {
      onSuccess,
    });
  });

  // 5. update_e2ee_key - Cập nhật E2EE public key
  socket.on("update_e2ee_key", async (data, callback) => {
    console.log(`🔄 [e2eeHandlers - ${username}] update_e2ee_key received:`, {
      ...data,
      publicKey: data.publicKey
        ? `${data.publicKey.substring(0, 20)}...`
        : "none",
    });

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["publicKey"], callback)) return;

    const keyType = data.keyType || "ecdh";

    const onSuccess = (response) => {
      if (response.data && response.data.fingerprint) {
        // Notify friends about key update
        notifyFriendsAboutKeyUpdate(
          keycloakId,
          username,
          response.data.fingerprint,
          keyType,
          io
        ).catch((err) =>
          console.error(`Failed to notify friends:`, err.message)
        );
      }
    };

    await callController(
      "updateE2EEPublicKey",
      { publicKey: data.publicKey, keyType },
      callback,
      { onSuccess }
    );
  });

  // 6. get_my_e2ee_keys - Lấy tất cả E2EE keys của user
  socket.on("get_my_e2ee_keys", async (callback) => {
    console.log(`🗝️ [e2eeHandlers - ${username}] get_my_e2ee_keys received`);

    if (!validateCallback(callback)) return;

    await callController("getAllMyE2EEKeys", {}, callback);
  });

  // 7. set_active_key - Đặt key làm active
  socket.on("set_active_key", async (data, callback) => {
    console.log(
      `⭐ [e2eeHandlers - ${username}] set_active_key received:`,
      data
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["fingerprint"], callback)) return;

    const onSuccess = (response) => {
      // Notify friends about key change
      notifyFriendsAboutKeyChange(
        keycloakId,
        username,
        data.fingerprint,
        io
      ).catch((err) => console.error(`Failed to notify friends:`, err.message));
    };

    await callController(
      "setActiveE2EEKey",
      { fingerprint: data.fingerprint },
      callback,
      { onSuccess }
    );
  });

  // 8. delete_e2ee_key - Xóa một key cụ thể
  socket.on("delete_e2ee_key", async (data, callback) => {
    console.log(
      `🗑️ [e2eeHandlers - ${username}] delete_e2ee_key received:`,
      data
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["fingerprint"], callback)) return;

    await callController(
      "deleteE2EEKey",
      { fingerprint: data.fingerprint },
      callback
    );
  });

  // 9. verify_fingerprint - Verify key fingerprint
  socket.on("verify_fingerprint", async (data, callback) => {
    console.log(`🔍 [e2eeHandlers - ${username}] verify_fingerprint received`);

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["publicKey", "expectedFingerprint"], callback))
      return;

    await callController(
      "verifyKeyFingerprint",
      {
        publicKey: data.publicKey,
        expectedFingerprint: data.expectedFingerprint,
      },
      callback
    );
  });

  // 10. initiate_key_exchange - Khởi tạo key exchange
  socket.on("initiate_key_exchange", async (data, callback) => {
    console.log(
      `🤝 [e2eeHandlers - ${username}] initiate_key_exchange received:`,
      data
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["peerId"], callback)) return;

    const onSuccess = (response) => {
      if (response.data) {
        // Send key exchange request to peer via socket
        io.to(data.peerId).emit("key_exchange_request", {
          from: keycloakId,
          username: username,
          publicKey: response.data.publicKey,
          fingerprint: response.data.fingerprint,
          exchangeId: response.data.exchangeId,
          timestamp: new Date(),
          source: "e2eeHandlers",
          handlerVersion: "2.0",
        });
        console.log(
          `📨 [${username}] Sent key exchange request to ${data.peerId}`
        );
      }
    };

    await callController(
      "initiateE2EEKeyExchange",
      { peerId: data.peerId },
      callback,
      { onSuccess }
    );
  });

  // 11. confirm_key_exchange - Xác nhận key exchange
  socket.on("confirm_key_exchange", async (data, callback) => {
    console.log(
      `✅ [e2eeHandlers - ${username}] confirm_key_exchange received:`,
      {
        ...data,
        publicKey: data.publicKey
          ? `${data.publicKey.substring(0, 20)}...`
          : "none",
      }
    );

    if (!validateCallback(callback)) return;
    if (
      !validateFields(
        data,
        ["exchangeId", "peerId", "publicKey", "fingerprint"],
        callback
      )
    )
      return;

    const verified = data.verified !== undefined ? data.verified : false;

    const onSuccess = (response) => {
      // Send confirmation to peer if verified
      if (verified) {
        io.to(data.peerId).emit("key_exchange_confirmed", {
          from: keycloakId,
          username: username,
          exchangeId: data.exchangeId,
          fingerprint: data.fingerprint,
          timestamp: new Date(),
          source: "e2eeHandlers",
          handlerVersion: "2.0",
        });
        console.log(
          `📨 [${username}] Sent key exchange confirmation to ${data.peerId}`
        );
      }
    };

    await callController(
      "confirmE2EEKeyExchange",
      {
        exchangeId: data.exchangeId,
        peerId: data.peerId,
        publicKey: data.publicKey,
        fingerprint: data.fingerprint,
        verified: verified,
      },
      callback,
      { onSuccess }
    );
  });

  // 12. send_encrypted_message - Gửi tin nhắn mã hóa
  socket.on("send_encrypted_message", async (data, callback) => {
    console.log(
      `🔐 [e2eeHandlers - ${username}] send_encrypted_message received:`,
      {
        ...data,
        ciphertext: data.ciphertext
          ? `${data.ciphertext.substring(0, 20)}...`
          : "none",
        iv: data.iv ? `${data.iv.substring(0, 10)}...` : "none",
      }
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["roomId", "ciphertext", "iv"], callback)) return;

    const messageData = {
      roomId: data.roomId,
      ciphertext: data.ciphertext,
      iv: data.iv,
      keyId: data.keyId,
      algorithm: data.algorithm || "AES-GCM-256",
      replyTo: data.replyTo,
    };

    await callController("sendEncryptedMessage", messageData, callback);
  });

  // 13. check_e2ee_status - Kiểm tra E2EE status của user khác
  socket.on("check_e2ee_status", async (data, callback) => {
    console.log(
      `📊 [e2eeHandlers - ${username}] check_e2ee_status received:`,
      data
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["userId"], callback)) return;

    await callController("checkE2EEStatus", { userId: data.userId }, callback);
  });

  // 14. get_encrypted_messages - Lấy encrypted messages của room
  socket.on("get_encrypted_messages", async (data, callback) => {
    console.log(
      `📨 [e2eeHandlers - ${username}] get_encrypted_messages received:`,
      data
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["roomId"], callback)) return;

    await callController(
      "getEncryptedMessages", // SỬA: Dùng hàm đúng tên từ controller
      {
        roomId: data.roomId,
        page: data.page || 1,
        limit: data.limit || 50,
      },
      callback
    );
  });

  // 15. test_direct_message - Test gửi message thường
  socket.on("test_direct_message", async (data, callback) => {
    console.log(
      `📝 [e2eeHandlers - ${username}] test_direct_message received:`,
      data
    );

    if (!validateCallback(callback)) return;

    try {
      const { roomId, content } = data;

      const mockReq = {
        user: { keycloakId },
        body: {
          roomId: roomId,
          content: content || "Test direct message",
          type: "text",
        },
        app: { get: (key) => (key === "io" ? io : null) },
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
                error: response.message,
              });
            }
          }
        },
      };

      // Gọi controller message trực tiếp
      const messageController = require("../../controllers/userController");
      if (messageController && messageController.sendMessage) {
        await messageController.sendMessage(mockReq, mockRes);
      } else {
        callback({
          success: false,
          error: "Message controller not available",
        });
      }
    } catch (err) {
      console.error(`❌ [${username}] Test direct message error:`, err.message);
      callback({
        success: false,
        error: err.message,
      });
    }
  });

  // 16. debug_room_access - Debug room access
  socket.on("debug_room_access", async (data, callback) => {
    console.log(
      `🐛 [e2eeHandlers - ${username}] debug_room_access received:`,
      data
    );

    if (!validateCallback(callback)) return;
    if (!validateFields(data, ["roomId"], callback)) return;

    try {
      // Kiểm tra trực tiếp
      const hasAccess = await checkRoomAccess(keycloakId, data.roomId);
      const room = await Room.findById(data.roomId);
      const user = await User.findOne({ keycloakId: keycloakId });

      callback({
        success: true,
        data: {
          userId: keycloakId,
          username: username,
          roomId: data.roomId,
          hasAccess: hasAccess,
          roomExists: !!room,
          roomDetails: room
            ? {
                _id: room._id,
                name: room.name,
                isGroup: room.isGroup,
                members: room.members || [],
                participants: room.participants || [],
                type: room.type,
              }
            : null,
          userDetails: {
            e2eeEnabled: user?.e2eeEnabled,
            currentKeyId: user?.currentKeyId,
            friends: user?.friends || [],
          },
          timestamp: new Date(),
        },
      });
    } catch (err) {
      console.error(`❌ [${username}] Debug room access error:`, err.message);
      callback({
        success: false,
        error: err.message,
      });
    }
  });
  // Thêm vào trong registerE2EEHandlers function, sau debug_room_access
  socket.on("quick_room_check", async (data, callback) => {
    console.log(`⚡ [${username}] quick_room_check:`, data);

    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);

      if (!room) {
        callback({
          success: false,
          error: "Room not found",
          data: null,
        });
        return;
      }

      // Kiểm tra trực tiếp
      const hasAccess = room.members.includes(keycloakId);

      callback({
        success: true,
        data: {
          roomId: room._id,
          roomName: room.name,
          isGroup: room.isGroup,
          members: room.members,
          hasAccess: hasAccess,
          currentUser: keycloakId,
          isMember: room.members.includes(keycloakId),
          memberCount: room.members.length,
        },
      });
    } catch (err) {
      console.error(`❌ [${username}] Quick room check error:`, err.message);
      callback({
        success: false,
        error: err.message,
      });
    }
  });

  // socket/handlers/e2eeHandlers.js - THÊM VÀO CUỐI registerE2EEHandlers
  socket.on("debug_create_room", async (data, callback) => {
    console.log(`🏗️ [${username}] debug_create_room:`, data);

    try {
      const { name, participants, isGroup = false } = data;

      // Tạo room đơn giản
      const room = await Room.create({
        name: name || "Debug Room",
        isGroup: isGroup,
        members: participants || [keycloakId],
        createdBy: keycloakId,
      });

      console.log(`✅ [${username}] Debug room created:`, room._id);

      callback({
        success: true,
        data: {
          roomId: room._id,
          name: room.name,
          members: room.members,
          isGroup: room.isGroup,
          createdBy: room.createdBy,
        },
      });
    } catch (err) {
      console.error(`❌ [${username}] Debug create room error:`, err.message);
      callback({
        success: false,
        error: err.message,
      });
    }
  });

  // 17. health_check - Extended health check
  socket.on("health_check", (callback) => {
    console.log(`🏥 [e2eeHandlers - ${username}] health_check received`);

    if (!validateCallback(callback)) return;

    try {
      const handlerStatus = {
        ping: socket.listeners("ping").length > 0,
        get_e2ee_info: socket.listeners("get_e2ee_info").length > 0,
        toggle_e2ee: socket.listeners("toggle_e2ee").length > 0,
        update_e2ee_key: socket.listeners("update_e2ee_key").length > 0,
        request_e2ee_key: socket.listeners("request_e2ee_key").length > 0,
        send_encrypted_message: socket.listeners("send_encrypted_message")
          .length,
        get_encrypted_messages: socket.listeners("get_encrypted_messages")
          .length,
        debug_room_access: socket.listeners("debug_room_access").length,
        controllerAvailable: !!e2eeController,
      };

      callback({
        success: true,
        data: {
          userId: keycloakId,
          username: username,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
          e2eeHandlers: handlerStatus,
          controllerFunctions: e2eeController
            ? Object.keys(e2eeController).filter(
                (k) => typeof e2eeController[k] === "function"
              )
            : [],
          source: "e2eeHandlers",
        },
      });
    } catch (err) {
      console.error(`❌ [${username}] Health check error:`, err.message);
      callback({ success: false, error: "Health check failed" });
    }
  });

  // ==================== VERIFICATION LOG ====================
  console.log(`\n🔍 [${username}] E2EE Handler verification:`);
  const registeredEvents = [
    "ping",
    "get_e2ee_info",
    "toggle_e2ee",
    "update_e2ee_key",
    "request_e2ee_key",
    "get_my_e2ee_keys",
    "send_encrypted_message",
    "get_encrypted_messages",
    "debug_room_access",
    "health_check",
  ];

  registeredEvents.forEach((event) => {
    const count = socket.listeners(event).length;
    console.log(`   ${event}: ${count} listener${count !== 1 ? "s" : ""}`);
  });

  console.log(`✅ [e2eeHandlers] All E2EE handlers registered for ${username}`);
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Check room access - Sử dụng từ controller nếu có, nếu không thì tự implement
 */
async function checkRoomAccess(userId, roomId) {
  try {
    // Thử dùng từ controller trước
    if (e2eeController && e2eeController.checkRoomAccess) {
      return await e2eeController.checkRoomAccess(userId, roomId);
    }

    // Fallback: tự implement
    console.log(
      `🔍 [checkRoomAccess] Checking access for user ${userId} to room ${roomId}`
    );
    const room = await Room.findOne({
      _id: roomId,
      members: userId,
    });
    console.log(
      `🔍 [checkRoomAccess] Room found: ${!!room}, members: ${
        room?.members || []
      }`
    );
    return !!room;
  } catch (error) {
    console.error("❌ Error checking room access:", error);
    return false;
  }
}

/**
 * Notify friends about E2EE status change
 */
async function notifyFriendsAboutE2EEStatus(keycloakId, username, enabled, io) {
  try {
    const user = await User.findOne({ keycloakId });
    if (!user || !user.friends || user.friends.length === 0) {
      console.log(
        `ℹ️ [${username}] No friends to notify about E2EE status change`
      );
      return;
    }

    user.friends.forEach((friendKeycloakId) => {
      io.to(friendKeycloakId).emit("friend_e2ee_status_changed", {
        userId: keycloakId,
        username: username,
        e2eeEnabled: enabled,
        timestamp: new Date(),
        source: "e2eeHandlers",
        handlerVersion: "2.0",
      });
    });

    console.log(
      `📢 [${username}] Notified ${user.friends.length} friends about E2EE status change`
    );
  } catch (err) {
    console.error(
      `❌ [${username}] Error notifying friends about E2EE status:`,
      err.message
    );
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
    if (!user || !user.friends || user.friends.length === 0) {
      console.log(`ℹ️ [${username}] No friends to notify about key update`);
      return;
    }

    user.friends.forEach((friendKeycloakId) => {
      io.to(friendKeycloakId).emit("friend_e2ee_key_updated", {
        userId: keycloakId,
        username: username,
        fingerprint: fingerprint,
        keyType: keyType,
        timestamp: new Date(),
        source: "e2eeHandlers",
        handlerVersion: "2.0",
      });
    });

    console.log(
      `📢 [${username}] Notified ${user.friends.length} friends about key update`
    );
  } catch (err) {
    console.error(
      `❌ [${username}] Error notifying friends about key update:`,
      err.message
    );
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
    if (!user || !user.friends || user.friends.length === 0) {
      console.log(`ℹ️ [${username}] No friends to notify about key change`);
      return;
    }

    user.friends.forEach((friendKeycloakId) => {
      io.to(friendKeycloakId).emit("friend_e2ee_key_changed", {
        userId: keycloakId,
        username: username,
        fingerprint: fingerprint,
        timestamp: new Date(),
        source: "e2eeHandlers",
        handlerVersion: "2.0",
      });
    });

    console.log(
      `📢 [${username}] Notified ${user.friends.length} friends about key change`
    );
  } catch (err) {
    console.error(
      `❌ [${username}] Error notifying friends about key change:`,
      err.message
    );
  }
}

module.exports = registerE2EEHandlers;
