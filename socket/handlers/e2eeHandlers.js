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
  // Cập nhật phần IMPORT CONTROLLER
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
    "getEncryptedMessages",
    // 🆕 THÊM 3 hàm mới
    "getMyCurrentKey",
    "checkAndSyncKey",
    "syncKeyFromClient",
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
  // Thêm vào mảng eventsToRemove
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
    "get_encrypted_messages",
    "test_direct_message",
    "debug_room_access",
    "quick_room_check",
    "debug_create_room",
    "health_check",
    // 🆕 THÊM các event mới
    "get_my_current_key",
    "check_and_sync_key",
    "sync_key_from_client",
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
    console.log(
      `🎯 [callController - ${username}] Calling ${controllerFn} with:`,
      {
        roomId: reqData.roomId,
        conversation_id: reqData.conversation_id,
        from: reqData.from,
        to: reqData.to,
        hasCiphertext: !!reqData.ciphertext,
        hasIV: !!reqData.iv,
        callbackProvided: !!callback,
      }
    );

    try {
      // Kiểm tra controller tồn tại
      if (!e2eeController) {
        console.error(`❌ [${username}] e2eeController is NULL!`);
        if (callback) {
          callback({
            success: false,
            error: "E2EE controller not loaded",
          });
        }
        return;
      }

      // Kiểm tra function tồn tại
      if (!e2eeController[controllerFn]) {
        console.error(`❌ [${username}] Function ${controllerFn} not found!`);
        console.error(`Available functions:`, Object.keys(e2eeController));
        if (callback) {
          callback({
            success: false,
            error: `Function ${controllerFn} not available in controller`,
          });
        }
        return;
      }

      console.log(`✅ [${username}] Controller and function verified`);

      // Tạo mock request với đầy đủ data
      const mockReq = {
        user: { keycloakId },
        body: reqData,
        app: {
          get: (key) => {
            if (key === "io") {
              console.log(`📡 [${username}] Returning io instance`);
              return io;
            }
            return null;
          },
        },
        // Thêm các field khác nếu controller cần
        params: {},
        query: {},
      };

      console.log(`📦 [${username}] Request data ready:`, {
        roomId: mockReq.body.roomId,
        conversation_id: mockReq.body.conversation_id,
        from: mockReq.body.from,
        to: mockReq.body.to,
      });

      // Tạo mock response với logging
      const mockRes = {
        status: (statusCode) => {
          console.log(`📊 [${username}] Controller status code: ${statusCode}`);
          return {
            json: (response) => {
              console.log(`📥 [${username}] Controller response:`, {
                statusCode,
                success:
                  response.status === "success" || response.success === true,
                message: response.message,
                hasData: !!response.data,
                hasCallback: !!callback,
              });

              // Gọi callback nếu có
              if (callback && typeof callback === "function") {
                console.log(`📤 [${username}] Executing callback`);
                if (
                  response.status === "success" ||
                  response.success === true
                ) {
                  callback({
                    success: true,
                    message: response.message,
                    data: response.data || response,
                  });
                } else {
                  callback({
                    success: false,
                    error:
                      response.message || response.error || "Operation failed",
                    data: response.data,
                  });
                }
              } else {
                console.warn(`⚠️ [${username}] No callback to execute`);
              }
            },
          };
        },
      };

      console.log(`🚀 [${username}] Executing controller: ${controllerFn}`);

      try {
        // Gọi controller
        const result = await e2eeController[controllerFn](mockReq, mockRes);
        console.log(
          `✅ [${username}] Controller ${controllerFn} execution completed`
        );

        // Nếu controller trả về promise nhưng không gọi res.json()
        if (result && !mockRes.called) {
          console.warn(
            `⚠️ [${username}] Controller didn't call res.json() directly`
          );
        }
      } catch (controllerError) {
        console.error(
          `❌ [${username}] Controller execution error:`,
          controllerError.message
        );
        console.error(controllerError.stack);

        if (callback) {
          callback({
            success: false,
            error: `Controller error: ${controllerError.message}`,
          });
        }
      }
    } catch (err) {
      console.error(
        `❌ [${username}] Error in callController wrapper:`,
        err.message
      );
      console.error(err.stack);

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
  // socket/handlers/e2eeHandlers.js - SỬA HÀM get_e2ee_info

  socket.on("get_e2ee_info", async (data, callback) => {
    console.log(
      `📤 [e2eeHandlers - ${username}] get_e2ee_info received`,
      data || ""
    );

    // Helper để send response
    const sendResponse = (response) => {
      console.log(`📤 [${username}] Sending E2EE info response:`, {
        success: response.success,
        hasCallback: !!callback,
        hasResponseId: !!(data && data.responseId),
      });

      // Ưu tiên callback nếu có
      if (callback && typeof callback === "function") {
        callback(response);
      }
      // Nếu có responseId, emit event với ID đó
      else if (data && data.responseId) {
        console.log(
          `📤 [${username}] Emitting response with ID: ${data.responseId}`
        );
        socket.emit(`e2ee_info_response_${data.responseId}`, response);
      }
      // Nếu không có gì, emit event mặc định
      else {
        console.warn(`⚠️ [${username}] No callback, emitting default response`);
        socket.emit("e2ee_info_response", response);
      }
    };

    try {
      if (!e2eeController || !e2eeController.getE2EEInfo) {
        console.warn(`⚠️ [${username}] Controller not available`);
        sendResponse({
          success: true,
          data: {
            keycloakId,
            username,
            e2eeEnabled: false,
            message: "E2EE controller not available",
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      const mockReq = {
        user: { keycloakId },
        body: {},
        app: { get: (key) => (key === "io" ? io : null) },
      };

      const mockRes = {
        status: () => mockRes,
        json: (controllerResponse) => {
          // Chuẩn hóa response từ controller
          const normalizedResponse = {
            success:
              controllerResponse.status === "success" ||
              controllerResponse.success === true,
            message: controllerResponse.message,
            data: controllerResponse.data || controllerResponse,
            timestamp: new Date().toISOString(),
          };

          sendResponse(normalizedResponse);
        },
      };

      await e2eeController.getE2EEInfo(mockReq, mockRes);
    } catch (err) {
      console.error(`❌ [${username}] Error in get_e2ee_info:`, err.message);
      sendResponse({
        success: false,
        error: `Server error: ${err.message}`,
        timestamp: new Date().toISOString(),
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
    console.log(
      `✅ [e2eeHandlers - ${username}] confirm_key_exchange received:`,
      {
        ...data,
        publicKey: data.publicKey
          ? typeof data.publicKey === "string"
            ? `${data.publicKey.substring(0, 20)}...`
            : `[Object: ${typeof data.publicKey}]`
          : "none",
      }
    );

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
  // handlers/socket/e2eeHandlers.js - SỬA handler confirm_key_exchange
  // 11. confirm_key_exchange - Xác nhận key exchange (FIXED VERSION)
  socket.on("confirm_key_exchange", async (data, callback) => {
    console.log(
      `✅ [e2eeHandlers - ${username}] confirm_key_exchange received:`,
      data
    );

    // DEBUG chi tiết
    console.log("🔍 [DEBUG] Full data object:", JSON.stringify(data, null, 2));
    console.log("🔍 [DEBUG] publicKey type:", typeof data?.publicKey);

    if (data?.publicKey) {
      if (typeof data.publicKey === "string") {
        console.log("🔍 [DEBUG] publicKey length:", data.publicKey.length);
        console.log(
          "🔍 [DEBUG] publicKey first 200 chars:",
          data.publicKey.substring(0, 200)
        );
      } else if (typeof data.publicKey === "object") {
        console.log(
          "🔍 [DEBUG] publicKey object keys:",
          Object.keys(data.publicKey)
        );
      }
    }

    const sendResponse = (response) => {
      if (callback && typeof callback === "function") {
        callback(response);
      } else {
        socket.emit("update_e2ee_key_response", response);
      }
    };

    try {
      // Kiểm tra dữ liệu đầu vào
      if (!data || !data.publicKey) {
        const errorMsg = "publicKey is required";
        console.error(`❌ [${username}] Validation error: ${errorMsg}`);
        sendResponse({
          success: false,
          error: errorMsg,
          code: "MISSING_PUBLIC_KEY",
        });
        return;
      }

      let publicKey = data.publicKey;
      const keyType = data.keyType || "ecdh";

      // Xử lý publicKey để đảm bảo là string JSON hợp lệ
      if (typeof publicKey === "object" && publicKey !== null) {
        console.log("🔄 Converting object to JSON string...");
        try {
          publicKey = JSON.stringify(publicKey);
          console.log(
            "✅ Converted object to string, length:",
            publicKey.length
          );
        } catch (e) {
          console.error("❌ Failed to stringify object:", e);
          sendResponse({
            success: false,
            error: "Invalid public key format (not JSON serializable)",
            code: "INVALID_KEY_FORMAT",
          });
          return;
        }
      }

      // Kiểm tra xem publicKey có phải là JSON hợp lệ không
      if (typeof publicKey === "string") {
        // Loại bỏ các ký tự đặc biệt có thể gây lỗi
        publicKey = publicKey.trim();

        // Kiểm tra xem có phải JSON hợp lệ không
        if (publicKey.startsWith("{") && publicKey.endsWith("}")) {
          try {
            JSON.parse(publicKey); // Test parse
            console.log("✅ Public key is valid JSON");
          } catch (e) {
            console.error("❌ Public key is not valid JSON:", e.message);
            sendResponse({
              success: false,
              error: "Public key is not valid JSON format",
              code: "INVALID_JSON",
            });
            return;
          }
        } else {
          console.warn(
            "⚠️ Public key doesn't look like JSON, but will process as string"
          );
        }
      } else {
        console.error(
          "❌ Public key is not a string after processing:",
          typeof publicKey
        );
        sendResponse({
          success: false,
          error: "Public key must be a string",
          code: "KEY_NOT_STRING",
        });
        return;
      }

      // Kiểm tra độ dài tối thiểu
      if (publicKey.length < 50) {
        console.error("❌ Public key too short:", publicKey.length);
        sendResponse({
          success: false,
          error: "Public key is too short (may be corrupted)",
          code: "KEY_TOO_SHORT",
          debug: { length: publicKey.length },
        });
        return;
      }

      console.log("🔍 [FINAL] Public key details:", {
        type: typeof publicKey,
        length: publicKey.length,
        first100: publicKey.substring(0, 100),
        last100: publicKey.substring(publicKey.length - 100),
      });

      // Gọi controller
      if (!e2eeController || !e2eeController.updateE2EEPublicKey) {
        console.error("❌ E2EE controller not available");
        sendResponse({
          success: false,
          error: "E2EE controller not available",
          code: "CONTROLLER_UNAVAILABLE",
        });
        return;
      }

      const mockReq = {
        user: { keycloakId },
        body: {
          publicKey: publicKey,
          keyType: keyType,
          debug: data.debug || false,
        },
        app: { get: (key) => (key === "io" ? io : null) },
      };

      const mockRes = {
        status: (code) => ({
          json: (response) => {
            console.log(`📥 [${username}] Controller response:`, {
              statusCode: code,
              response: response,
            });

            // Chuẩn hóa response format
            const normalizedResponse = {
              success:
                response.status === "success" || response.success === true,
              message:
                response.message || response.error || "Operation completed",
              data: response.data || null,
              code:
                response.code ||
                (response.status === "success" ? "SUCCESS" : "ERROR"),
            };

            sendResponse(normalizedResponse);
          },
        }),
      };

      await e2eeController.updateE2EEPublicKey(mockReq, mockRes);
      console.log("✅ confirm_key_exchange processed successfully");
    } catch (error) {
      console.error("❌ Error in confirm_key_exchange handler:", error);
      sendResponse({
        success: false,
        error: error.message,
        code: "HANDLER_ERROR",
        stack: error.stack,
      });
    }
  });

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

    console.log(`🔍 [DEBUG START] Handler execution start`);
    console.log(`🔍 Username: ${username}, keycloakId: ${keycloakId}`);
    console.log(`🔍 callController function exists:`, typeof callController);
    console.log(`🔍 e2eeController exists:`, !!e2eeController);
    console.log(
      `🔍 e2eeController.sendEncryptedMessage exists:`,
      e2eeController ? !!e2eeController.sendEncryptedMessage : false
    );

    if (!validateCallback(callback)) {
      console.log(`❌ validateCallback failed`);
      return;
    }
    console.log(`✅ validateCallback passed`);

    // Sửa: Hỗ trợ cả conversation_id và roomId
    if (!data.roomId && data.conversation_id) {
      data.roomId = data.conversation_id;
      console.log(`🔄 Converted conversation_id to roomId: ${data.roomId}`);
    }

    console.log(`🔍 Before validateFields:`, {
      roomId: data.roomId,
      ciphertext: !!data.ciphertext,
      iv: !!data.iv,
      from: data.from,
      to: data.to,
    });

    if (!validateFields(data, ["roomId", "ciphertext", "iv"], callback)) {
      console.log(`❌ validateFields failed`);
      return;
    }
    console.log(`✅ validateFields passed`);

    const messageData = {
      roomId: data.roomId,
      ciphertext: data.ciphertext,
      iv: data.iv,
      keyId: data.keyId,
      algorithm: data.algorithm || "AES-GCM-256",
      replyTo: data.replyTo,
      // THÊM các trường QUAN TRỌNG
      from: data.from, // <-- QUAN TRỌNG
      to: data.to, // <-- QUAN TRỌNG
      type: data.type || "text",
      timestamp: data.timestamp || new Date().toISOString(),
      peerFingerprint: data.peerFingerprint,
      isEncrypted: data.isEncrypted || true,
      conversation_id: data.conversation_id || data.roomId, // Thêm để controller biết
    };

    console.log(`🔍 Message data prepared:`, {
      roomId: messageData.roomId,
      from: messageData.from,
      to: messageData.to,
      ciphertextLength: messageData.ciphertext?.length,
      ivLength: messageData.iv?.length,
      hasFrom: !!messageData.from,
      hasTo: !!messageData.to,
    });

    console.log(`🚀 Calling callController...`);
    console.log(`📞 Function: sendEncryptedMessage`);

    // KIỂM TRA LẠI TRƯỚC KHI GỌI
    if (!callController) {
      console.error(`❌ callController is not defined!`);
      callback({
        success: false,
        error: "callController function not defined",
      });
      return;
    }

    if (!e2eeController) {
      console.error(`❌ e2eeController is null!`);
      callback({
        success: false,
        error: "E2EE controller not loaded",
      });
      return;
    }

    if (!e2eeController.sendEncryptedMessage) {
      console.error(`❌ sendEncryptedMessage function not found!`);
      console.error(
        `Available functions:`,
        Object.keys(e2eeController).filter(
          (k) => typeof e2eeController[k] === "function"
        )
      );

      callback({
        success: false,
        error: "sendEncryptedMessage function not available",
      });
      return;
    }

    try {
      console.log(`🎯 Executing callController...`);
      await callController("sendEncryptedMessage", messageData, callback);
      console.log(`✅ callController completed`);
    } catch (err) {
      console.error(`❌ Error in handler:`, err.message);
      console.error(err.stack);

      if (callback) {
        callback({
          success: false,
          error: "Handler error: " + err.message,
        });
      }
    }
  });

  socket.on("get_encrypted_messages", async (data, callback) => {
    console.log(
      `📨 [e2eeHandlers - ${username}] get_encrypted_messages received:`,
      data
    );

    if (!validateCallback(callback)) return;

    // Sửa: Hỗ trợ cả conversation_id và roomId
    if (!data.roomId && data.conversation_id) {
      data.roomId = data.conversation_id;
    }

    if (!validateFields(data, ["roomId"], callback)) return;

    await callController(
      "getEncryptedMessages",
      {
        roomId: data.roomId,
        page: data.page || 1,
        limit: data.limit || 50,
      },
      callback
    );
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

  // ==================== THÊM HÀM MỚI VÀO registerE2EEHandlers ====================

  // 18. get_my_current_key - Lấy key hiện tại của bản thân để so sánh với storage
  socket.on("get_my_current_key", async (callback) => {
    console.log(`🔑 [e2eeHandlers - ${username}] get_my_current_key received`);

    if (!validateCallback(callback)) return;

    await callController("getMyCurrentKey", {}, callback);
  });

  // 19. check_and_sync_key - Kiểm tra và đồng bộ key với frontend storage
  socket.on("check_and_sync_key", async (data, callback) => {
    console.log(
      `🔄 [e2eeHandlers - ${username}] check_and_sync_key received:`,
      {
        hasClientKey: !!data?.publicKey,
        clientFingerprint: data?.fingerprint,
      }
    );

    if (!validateCallback(callback)) return;

    // Kiểm tra dữ liệu từ client
    const clientData = {
      clientPublicKey: data?.publicKey,
      clientFingerprint: data?.fingerprint,
      clientCreatedAt: data?.createdAt,
    };

    await callController("checkAndSyncKey", clientData, callback);
  });

  // 20. sync_key_from_client - Đồng bộ key từ client lên server
  socket.on("sync_key_from_client", async (data, callback) => {
    console.log(
      `📤 [e2eeHandlers - ${username}] sync_key_from_client received:`,
      {
        hasPublicKey: !!data?.publicKey,
        fingerprint: data?.fingerprint,
        keyType: data?.keyType,
      }
    );

    if (!validateCallback(callback)) return;

    // Kiểm tra required fields
    if (!validateFields(data, ["publicKey"], callback)) return;

    const syncData = {
      publicKey: data.publicKey,
      fingerprint: data.fingerprint,
      keyType: data.keyType || "ecdh",
      forceUpdate: data.forceUpdate || false,
    };

    await callController("syncKeyFromClient", syncData, callback);
  });

  // 21. auto_sync_on_login - Tự động đồng bộ khi đăng nhập (trigger từ client)
  socket.on("auto_sync_on_login", async (data, callback) => {
    console.log(`🚀 [e2eeHandlers - ${username}] auto_sync_on_login received`);

    if (!validateCallback(callback)) return;

    try {
      // 1. Kiểm tra xem có key trên client không
      const clientKeyData = data || {};

      // 2. Kiểm tra sync status
      const syncCheck = await new Promise((resolve) => {
        const mockCallback = (response) => resolve(response);

        // Tạo mock call
        const mockData = {
          publicKey: clientKeyData.publicKey,
          fingerprint: clientKeyData.fingerprint,
          createdAt: clientKeyData.createdAt,
        };

        // Gọi check_and_sync_key
        socket.emit("check_and_sync_key", mockData, mockCallback);
      });

      console.log(`🔍 [${username}] Sync check result:`, {
        syncRequired: syncCheck.data?.syncRequired,
        syncAction: syncCheck.data?.syncAction,
        match: syncCheck.data?.match,
      });

      // 3. Thực hiện sync nếu cần
      if (syncCheck.success && syncCheck.data?.syncRequired) {
        const syncAction = syncCheck.data.syncAction;

        switch (syncAction) {
          case "server_needs_update":
          case "use_client_key":
            // Client có key mới hơn hoặc server không có key
            if (clientKeyData.publicKey) {
              console.log(`🔄 [${username}] Uploading client key to server...`);

              const syncResult = await new Promise((resolve) => {
                const syncCallback = (response) => resolve(response);

                const syncData = {
                  publicKey: clientKeyData.publicKey,
                  fingerprint: clientKeyData.fingerprint,
                  keyType: clientKeyData.keyType || "ecdh",
                  forceUpdate: true,
                };

                socket.emit("sync_key_from_client", syncData, syncCallback);
              });

              if (syncResult.success) {
                console.log(`✅ [${username}] Client key synced to server`);
                callback({
                  success: true,
                  message: "Client key synced to server",
                  data: {
                    action: "client_to_server",
                    fingerprint: syncResult.data?.fingerprint,
                    syncStatus: syncResult.data?.syncStatus,
                  },
                });
              } else {
                callback({
                  success: false,
                  error: "Failed to sync client key to server",
                  details: syncResult.error,
                });
              }
            }
            break;

          case "client_needs_update":
          case "use_server_key":
            // Server có key mới hơn, client cần lấy từ server
            console.log(`🔄 [${username}] Getting current key from server...`);

            const serverKey = await new Promise((resolve) => {
              const keyCallback = (response) => resolve(response);
              socket.emit("get_my_current_key", keyCallback);
            });

            if (serverKey.success && serverKey.data?.hasKey) {
              console.log(`✅ [${username}] Server key retrieved`);
              callback({
                success: true,
                message: "Server key retrieved",
                data: {
                  action: "server_to_client",
                  key: serverKey.data.key,
                  syncAction: syncAction,
                },
              });
            } else {
              callback({
                success: false,
                error: "Failed to get server key",
                details: serverKey.error,
              });
            }
            break;

          case "create_new":
            // Cả server và client đều không có key
            console.log(`🆕 [${username}] No keys found, need to create new`);
            callback({
              success: true,
              message: "No keys found on both server and client",
              data: {
                action: "create_new",
                syncAction: syncAction,
              },
            });
            break;

          default:
            callback({
              success: true,
              message: "No sync action needed",
              data: {
                action: "no_action",
                syncAction: syncAction,
              },
            });
        }
      } else if (syncCheck.success && !syncCheck.data?.syncRequired) {
        // Keys đã đồng bộ
        console.log(`✅ [${username}] Keys are already in sync`);
        callback({
          success: true,
          message: "Keys are already in sync",
          data: {
            action: "already_synced",
            match: syncCheck.data?.match,
          },
        });
      } else {
        callback({
          success: false,
          error: "Failed to check sync status",
          details: syncCheck.error,
        });
      }
    } catch (err) {
      console.error(
        `❌ [${username}] Error in auto_sync_on_login:`,
        err.message
      );
      callback({
        success: false,
        error: `Auto sync failed: ${err.message}`,
      });
    }
  });

  // ==================== VERIFICATION LOG ====================
  console.log(`\n🔍 [${username}] E2EE Handler verification:`);
  // ==================== VERIFICATION LOG ====================

  const registeredEvents = [
    "ping",
    "get_e2ee_info",
    "toggle_e2ee",
    "update_e2ee_key",
    "request_e2ee_key",
    "get_my_e2ee_keys",
    "set_active_key",
    "delete_e2ee_key",
    "verify_fingerprint",
    "initiate_key_exchange",
    "confirm_key_exchange",
    "send_encrypted_message",
    "get_encrypted_messages",
    "check_e2ee_status",
    "test_direct_message",
    "debug_room_access",
    "quick_room_check",
    "debug_create_room",
    "health_check",
    // 🆕 THÊM các event mới
    "get_my_current_key",
    "check_and_sync_key",
    "sync_key_from_client",
    "auto_sync_on_login",
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
