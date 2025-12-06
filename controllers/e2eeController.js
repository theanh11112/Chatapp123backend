// controllers/e2eeController.js - HOÀN CHỈNH VERSION
const crypto = require("crypto");
const User = require("../models/user");
const Message = require("../models/message");
const Room = require("../models/room");
const catchAsync = require("../utils/catchAsync");
const OneToOneMessage = require("../models/OneToOneMessage");

/*
|--------------------------------------------------------------------------
| E2EE UTILITY FUNCTIONS
|--------------------------------------------------------------------------
*/

// Helper: Tính fingerprint của key
// Helper: Tính fingerprint của key
const calculateKeyFingerprint = (publicKey) => {
  console.log("🔍 [calculateKeyFingerprint] Input type:", typeof publicKey);

  let keyString;

  if (typeof publicKey === "string") {
    keyString = publicKey;
  } else if (typeof publicKey === "object") {
    // Nếu là object (JWK), stringify nó
    keyString = JSON.stringify(publicKey);
  } else if (Buffer.isBuffer(publicKey)) {
    keyString = publicKey.toString("base64");
  } else {
    throw new Error(
      `Invalid public key type: ${typeof publicKey}. Expected string or object.`
    );
  }

  console.log(
    "🔍 [calculateKeyFingerprint] Processing string length:",
    keyString.length
  );

  return crypto
    .createHash("sha256")
    .update(keyString)
    .digest("hex")
    .substring(0, 8)
    .toUpperCase();
};
// Helper: Tạo exchange ID duy nhất
const generateExchangeId = (user1Id, user2Id) => {
  const ids = [user1Id, user2Id].sort();
  return crypto
    .createHash("md5")
    .update(ids.join("|"))
    .digest("hex")
    .substring(0, 12)
    .toUpperCase();
};

// Helper: Kiểm tra quyền truy cập E2EE
const checkE2EEAccess = async (userId, targetUserId) => {
  try {
    if (userId === targetUserId) return true;

    const user = await User.findOne({ keycloakId: userId });
    if (user && user.friends && user.friends.includes(targetUserId)) {
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Error checking E2EE access:", error);
    return false;
  }
};

// Thêm hàm này để kiểm tra quyền truy cập room
// controllers/e2eeController.js - SỬA LẠI HOÀN TOÀN
const mongoose = require("mongoose");

const checkRoomAccess = async (keycloakId, roomId) => {
  try {
    console.log(
      `🔍 [checkRoomAccess] Checking access for keycloakId: ${keycloakId} to room/conversation: ${roomId}`
    );

    // Chuyển đổi roomId string thành ObjectId nếu hợp lệ
    let roomIdObj;
    try {
      roomIdObj = mongoose.Types.ObjectId.isValid(roomId)
        ? new mongoose.Types.ObjectId(roomId)
        : null;
    } catch (error) {
      console.log(`⚠️  Invalid roomId format: ${roomId}`);
      return false;
    }

    // 1. Trước hết, kiểm tra trong Room model (group chat) - CHỈ khi roomId là ObjectId hợp lệ
    if (roomIdObj) {
      const room = await Room.findOne({
        _id: roomIdObj, // Dùng ObjectId thay vì string
        members: keycloakId,
      });

      if (room) {
        console.log(
          `✅ [checkRoomAccess] Access GRANTED - Group room found for ${keycloakId} to room ${roomId}`
        );
        console.log(
          `   Room name: ${room.name}, Type: group, Members count: ${room.members.length}`
        );
        return true;
      }
    }

    // 2. Kiểm tra trong OneToOneMessage (direct chat) - CHỈ khi roomId là ObjectId hợp lệ
    if (roomIdObj) {
      const oneToOneConversation = await OneToOneMessage.findOne({
        _id: roomIdObj, // Dùng ObjectId thay vì string
        participants: keycloakId,
      });

      if (oneToOneConversation) {
        console.log(
          `✅ [checkRoomAccess] Access GRANTED - One-to-one conversation found for ${keycloakId} to conversation ${roomId}`
        );
        console.log(
          `   Conversation type: direct, Participants: ${JSON.stringify(
            oneToOneConversation.participants
          )}`
        );
        return true;
      }
    }

    // 3. Nếu roomId không phải là ObjectId hợp lệ, có thể nó là một identifier khác
    // Ví dụ: custom conversation ID hoặc participants hash
    if (!roomIdObj) {
      console.log(`ℹ️  ${roomId} không phải là MongoDB ObjectId hợp lệ`);

      // THÊM: Kiểm tra nếu roomId là string representation của participants
      // Ví dụ: "user1_user2" hoặc participants array dạng string
      // Bạn có thể cần logic tùy chỉnh ở đây
      const participants = roomId.split("_").filter((p) => p.length > 0);
      if (participants.length >= 2 && participants.includes(keycloakId)) {
        console.log(
          `✅ [checkRoomAccess] Access GRANTED via participants hash for ${keycloakId}`
        );
        return true;
      }
    }

    // 4. Debug: Kiểm tra xem room/conversation có tồn tại không
    console.log(
      `❌ [checkRoomAccess] Access DENIED for ${keycloakId} to room/conversation ${roomId}`
    );

    // Debug: Kiểm tra Room có tồn tại không
    if (roomIdObj) {
      const roomExists = await Room.findById(roomIdObj);
      if (roomExists) {
        console.log(`ℹ️  Group room exists but ${keycloakId} not in members`);
        console.log(`   Room members: ${JSON.stringify(roomExists.members)}`);
      } else {
        console.log(`ℹ️  No group room found with ID: ${roomId}`);
      }

      // Debug: Kiểm tra OneToOneMessage có tồn tại không
      const conversationExists = await OneToOneMessage.findById(roomIdObj);
      if (conversationExists) {
        console.log(
          `ℹ️  One-to-one conversation exists but ${keycloakId} not in participants`
        );
        console.log(
          `   Conversation participants: ${JSON.stringify(
            conversationExists.participants
          )}`
        );
      } else {
        console.log(`ℹ️  No one-to-one conversation found with ID: ${roomId}`);
      }
    }

    return false;
  } catch (error) {
    console.error("❌ [checkRoomAccess] Error:", error.message);
    return false;
  }
};

// ==================== CONTROLLER FUNCTIONS ====================

// 1. Cập nhật E2EE public key cho user
// POST /users/e2ee/update-key
// 1. Cập nhật E2EE public key cho user - VERSION FIXED
// POST /users/e2ee/update-key
// controllers/e2eeController.js - SỬA LẠI updateE2EEPublicKey
const updateE2EEPublicKey = catchAsync(async (req, res) => {
  try {
    const {
      publicKey,
      keyType = "ecdh",
      debug = false,
      forceUpdate = false,
    } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🔑 Updating E2EE public key for user:", currentUserId);

    // VALIDATION STRICT
    if (!publicKey) {
      return res.status(400).json({
        status: "error",
        message: "publicKey is required",
      });
    }

    // VALIDATE KEY FORMAT
    const validation = validatePublicKey(publicKey);
    if (!validation.valid) {
      return res.status(400).json({
        status: "error",
        message: validation.error,
      });
    }

    // TÌM USER
    const user = await User.findOne({ keycloakId: currentUserId });
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Tính fingerprint
    const fingerprint = calculateKeyFingerprint(publicKey);
    console.log("✅ Calculated fingerprint:", fingerprint);

    // KIỂM TRA NẾU KEY ĐÃ TỒN TẠI
    const existingKey = user.e2eeKeys?.find(
      (key) => key.fingerprint === fingerprint
    );

    if (existingKey) {
      console.log("ℹ️ Key already exists:", {
        fingerprint,
        isActive: existingKey.isActive,
        createdAt: existingKey.createdAt,
      });

      // Nếu key đã tồn tại và active, chỉ cần trả về success
      if (existingKey.isActive && !forceUpdate) {
        return res.status(200).json({
          status: "success",
          message: "Public key already exists and is active",
          data: {
            fingerprint,
            keyType: existingKey.keyType,
            createdAt: existingKey.createdAt,
            e2eeEnabled: user.e2eeEnabled || true,
            alreadyExists: true,
            isActive: true,
          },
        });
      }

      // Nếu forceUpdate hoặc key không active, reactivate nó
      if (!existingKey.isActive || forceUpdate) {
        console.log("🔄 Reactivating existing key...");

        // Đánh dấu tất cả keys cũ là không active
        user.e2eeKeys.forEach((key) => {
          key.isActive = false;
        });

        // Kích hoạt lại key hiện tại
        existingKey.isActive = true;
        existingKey.keyType = keyType;
        existingKey.updatedAt = new Date();

        user.currentKeyId = fingerprint;
        user.e2eeEnabled = true;

        await user.save();

        return res.status(200).json({
          status: "success",
          message: "Existing key reactivated successfully",
          data: {
            fingerprint,
            keyType,
            e2eeEnabled: user.e2eeEnabled,
            alreadyExists: true,
            reactivated: true,
          },
        });
      }
    }

    // DỌN DẸP KEYS CŨ (giữ tối đa 5 keys gần nhất)
    await cleanupOldKeys(user);

    // THÊM KEY MỚI
    const newKey = {
      publicKey: publicKey,
      keyType: keyType,
      fingerprint: fingerprint,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      isRevoked: false,
    };

    // Đánh dấu tất cả keys cũ là không active
    user.e2eeKeys.forEach((key) => {
      key.isActive = false;
    });

    // Thêm vào mảng keys
    user.e2eeKeys = user.e2eeKeys || [];
    user.e2eeKeys.push(newKey);

    // Cập nhật current key
    user.currentKeyId = fingerprint;
    user.e2eeEnabled = true;
    user.updatedAt = new Date();

    await user.save();

    console.log("✅ New E2EE key added:", {
      userId: currentUserId,
      fingerprint,
      totalKeys: user.e2eeKeys.length,
    });

    // Notify friends
    notifyFriendsAboutKeyUpdate(user, fingerprint, keyType, req);

    res.status(200).json({
      status: "success",
      message: "E2EE public key updated successfully",
      data: {
        fingerprint,
        keyType,
        createdAt: newKey.createdAt,
        e2eeEnabled: user.e2eeEnabled,
        alreadyExists: false,
        totalKeys: user.e2eeKeys.length,
      },
    });
  } catch (error) {
    console.error("❌ Error updating E2EE public key:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update E2EE public key",
      error: error.message,
    });
  }
});

// Hàm cleanup old keys
const cleanupOldKeys = async (user) => {
  try {
    if (!user.e2eeKeys || user.e2eeKeys.length <= 5) {
      return;
    }

    // Sắp xếp keys theo thời gian tạo (mới nhất trước)
    const sortedKeys = [...user.e2eeKeys].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    // Giữ lại 5 keys gần nhất
    const keysToKeep = sortedKeys.slice(0, 5);

    // Tìm IDs của keys cần giữ
    const fingerprintsToKeep = keysToKeep.map((k) => k.fingerprint);

    // Lọc bỏ keys cũ
    user.e2eeKeys = user.e2eeKeys.filter((key) =>
      fingerprintsToKeep.includes(key.fingerprint)
    );

    console.log(
      `🧹 Cleaned up old keys, keeping ${user.e2eeKeys.length} most recent keys`
    );
  } catch (error) {
    console.error("❌ Error cleaning up old keys:", error);
  }
};

// Hàm validate public key CHẶT CHẼ HƠN
const validatePublicKey = (publicKey) => {
  if (!publicKey) {
    return { valid: false, error: "Public key is required" };
  }

  if (typeof publicKey !== "string") {
    return { valid: false, error: "Public key must be a string" };
  }

  // Kiểm tra độ dài tối thiểu
  if (publicKey.length < 50) {
    return {
      valid: false,
      error: `Public key too short (${publicKey.length} chars). Minimum 50 characters required.`,
    };
  }

  // Kiểm tra key rỗng
  if (publicKey.trim() === "{}") {
    return { valid: false, error: "Public key cannot be empty object {}" };
  }

  // Kiểm tra nếu là JSON hợp lệ
  const trimmedKey = publicKey.trim();
  if (trimmedKey.startsWith("{") && trimmedKey.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmedKey);

      // Kiểm tra JWK format
      if (!parsed.kty || !parsed.crv) {
        return {
          valid: false,
          error: "Invalid JWK format: missing kty or crv",
        };
      }

      if (parsed.kty !== "EC" || parsed.crv !== "P-256") {
        return {
          valid: false,
          error: `Unsupported key type: ${parsed.kty}/${parsed.crv}. Only EC/P-256 supported.`,
        };
      }

      // Kiểm tra x và y coordinates
      if (!parsed.x || !parsed.y) {
        return {
          valid: false,
          error: "Invalid JWK: missing x or y coordinates",
        };
      }

      // Kiểm tra độ dài coordinates
      if (parsed.x.length < 10 || parsed.y.length < 10) {
        return { valid: false, error: "Invalid coordinates length" };
      }

      return { valid: true, format: "jwk" };
    } catch (e) {
      return { valid: false, error: "Invalid JSON format: " + e.message };
    }
  }

  // Kiểm tra base64 format
  if (publicKey.match(/^[A-Za-z0-9+/=]+$/)) {
    // Đây có thể là base64
    try {
      // Decode base64 để kiểm tra
      const decoded = Buffer.from(publicKey, "base64");
      if (decoded.length < 32) {
        // Độ dài tối thiểu cho EC key
        return { valid: false, error: "Base64 key too short" };
      }
      return { valid: true, format: "base64" };
    } catch (e) {
      return { valid: false, error: "Invalid base64 format" };
    }
  }

  return {
    valid: false,
    error: "Unsupported key format. Must be valid JWK JSON or base64 string.",
  };
};

// Hàm notify friends
const notifyFriendsAboutKeyUpdate = (user, fingerprint, keyType, req) => {
  try {
    if (user.friends && user.friends.length > 0 && req.app.get("io")) {
      const io = req.app.get("io");
      user.friends.forEach((friendKeycloakId) => {
        io.to(friendKeycloakId).emit("friend_e2ee_key_updated", {
          userId: user.keycloakId,
          username: user.username,
          fingerprint: fingerprint,
          keyType: keyType,
          timestamp: new Date(),
        });
      });
      console.log(
        "📢 Notified",
        user.friends.length,
        "friends about key update"
      );
    }
  } catch (error) {
    console.error("❌ Error notifying friends:", error);
  }
};

// 2. Lấy E2EE public key của một user
// POST /users/e2ee/public-key
const getUserE2EEPublicKey = catchAsync(async (req, res) => {
  try {
    const { userId } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🔑 Getting E2EE public key for user:", userId);

    // VALIDATION
    if (!userId) {
      return res.status(400).json({
        status: "error",
        message: "userId is required in request body",
      });
    }

    // TÌM USER
    const user = await User.findOne({ keycloakId: userId }).select(
      "keycloakId username currentKeyId e2eeKeys e2eeEnabled"
    );

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // KIỂM TRA NẾU USER ĐÃ TẮT E2EE
    if (!user.e2eeEnabled) {
      return res.status(400).json({
        status: "error",
        message: "User has E2EE disabled",
      });
    }

    // LẤY CURRENT ACTIVE KEY
    const currentKey = user.e2eeKeys?.find(
      (key) => key.fingerprint === user.currentKeyId && key.isActive
    );

    if (!currentKey) {
      return res.status(404).json({
        status: "error",
        message: "No active E2EE key found for this user",
      });
    }

    // KIỂM TRA QUYỀN TRUY CẬP
    const hasAccess = await checkE2EEAccess(currentUserId, userId);
    if (!hasAccess) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to user's E2EE key",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        keycloakId: user.keycloakId,
        username: user.username,
        publicKey: currentKey.publicKey,
        keyType: currentKey.keyType,
        fingerprint: currentKey.fingerprint,
        createdAt: currentKey.createdAt,
        e2eeEnabled: user.e2eeEnabled,
      },
    });
  } catch (error) {
    console.error("❌ Error getting user E2EE public key:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get user E2EE public key",
    });
  }
});

// 3. Lấy tất cả E2EE keys của user
// GET /users/e2ee/my-keys
const getAllMyE2EEKeys = catchAsync(async (req, res) => {
  try {
    const currentUserId = req.user?.keycloakId;

    console.log("🔑 Getting all E2EE keys for user:", currentUserId);

    const user = await User.findOne({ keycloakId: currentUserId }).select(
      "keycloakId username e2eeKeys currentKeyId e2eeEnabled"
    );

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        keycloakId: user.keycloakId,
        username: user.username,
        e2eeEnabled: user.e2eeEnabled,
        currentKeyId: user.currentKeyId,
        keys: user.e2eeKeys || [],
        totalKeys: (user.e2eeKeys || []).length,
        activeKeys: (user.e2eeKeys || []).filter((k) => k.isActive).length,
      },
    });
  } catch (error) {
    console.error("❌ Error getting E2EE keys:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get E2EE keys",
    });
  }
});

// 4. Khởi tạo E2EE key exchange với một user
// POST /users/e2ee/initiate-exchange
const initiateE2EEKeyExchange = catchAsync(async (req, res) => {
  try {
    const { peerId } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🔄 Initiating E2EE key exchange with:", peerId);

    // VALIDATION
    if (!peerId) {
      return res.status(400).json({
        status: "error",
        message: "peerId is required",
      });
    }

    // TÌM USERS
    const [currentUser, peerUser] = await Promise.all([
      User.findOne({ keycloakId: currentUserId }),
      User.findOne({ keycloakId: peerId }),
    ]);

    if (!currentUser || !peerUser) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // KIỂM TRA ĐÃ LÀ BẠN BÈ
    if (!currentUser.friends.includes(peerId)) {
      return res.status(403).json({
        status: "error",
        message: "Cannot initiate E2EE key exchange with non-friend",
      });
    }

    // LẤY CURRENT ACTIVE KEY
    const currentKey = currentUser.e2eeKeys?.find(
      (key) => key.fingerprint === currentUser.currentKeyId && key.isActive
    );

    if (!currentKey) {
      return res.status(400).json({
        status: "error",
        message:
          "You don't have an active E2EE key. Please generate one first.",
      });
    }

    // KIỂM TRA PEER CÓ E2EE ENABLED KHÔNG
    if (!peerUser.e2eeEnabled) {
      return res.status(400).json({
        status: "error",
        message: "Peer user does not have E2EE enabled",
      });
    }

    // TẠO EXCHANGE ID
    const exchangeId = generateExchangeId(currentUserId, peerId);

    res.status(200).json({
      status: "success",
      message: "E2EE key exchange initiated",
      data: {
        from: currentUserId,
        to: peerId,
        publicKey: currentKey.publicKey,
        keyType: currentKey.keyType,
        fingerprint: currentKey.fingerprint,
        exchangeId: exchangeId,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error initiating E2EE key exchange:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to initiate E2EE key exchange",
    });
  }
});

// 5. Xác nhận E2EE key exchange
// POST /users/e2ee/confirm-exchange
const confirmE2EEKeyExchange = catchAsync(async (req, res) => {
  try {
    const {
      exchangeId,
      peerId,
      publicKey,
      fingerprint,
      verified = false,
    } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("✅ Confirming E2EE key exchange:", {
      exchangeId,
      peerId,
      verified,
    });

    // VALIDATION
    if (!exchangeId || !peerId || !publicKey || !fingerprint) {
      return res.status(400).json({
        status: "error",
        message: "exchangeId, peerId, publicKey, and fingerprint are required",
      });
    }

    // KIỂM TRA EXCHANGE ID HỢP LỆ
    const expectedExchangeId = generateExchangeId(peerId, currentUserId);
    if (exchangeId !== expectedExchangeId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid exchange ID",
      });
    }

    // TÌM PEER USER
    const peerUser = await User.findOne({ keycloakId: peerId });
    if (!peerUser) {
      return res.status(404).json({
        status: "error",
        message: "Peer user not found",
      });
    }

    // KIỂM TRA FINGERPRINT
    const calculatedFingerprint = calculateKeyFingerprint(publicKey);
    if (calculatedFingerprint !== fingerprint) {
      return res.status(400).json({
        status: "error",
        message: "Key fingerprint mismatch",
      });
    }

    console.log("🔑 Peer key verified:", {
      peerId,
      fingerprint,
      verified,
    });

    // NẾU VERIFIED, GỬI SOCKET EVENT
    if (verified && req.app.get("io")) {
      const io = req.app.get("io");
      io.to(peerId).emit("e2ee_key_exchange_confirmed", {
        from: currentUserId,
        exchangeId,
        fingerprint,
        timestamp: new Date(),
      });
    }

    res.status(200).json({
      status: "success",
      message: "E2EE key exchange confirmed",
      data: {
        exchangeId,
        peerId,
        fingerprint,
        verified,
        confirmedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error confirming E2EE key exchange:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to confirm E2EE key exchange",
    });
  }
});

// 6. Lấy E2EE thông tin của user
// GET /users/e2ee/info
const getE2EEInfo = catchAsync(async (req, res) => {
  try {
    const currentUserId = req.user?.keycloakId;

    console.log("🔍 Getting E2EE info for user:", currentUserId);

    const user = await User.findOne({ keycloakId: currentUserId });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    const currentKey = user.e2eeKeys?.find(
      (key) => key.fingerprint === user.currentKeyId
    );

    res.status(200).json({
      status: "success",
      data: {
        keycloakId: user.keycloakId,
        username: user.username,
        e2eeEnabled: user.e2eeEnabled || false,
        currentKey: currentKey
          ? {
              fingerprint: currentKey.fingerprint,
              keyType: currentKey.keyType,
              createdAt: currentKey.createdAt,
              isActive: currentKey.isActive,
            }
          : null,
        totalKeys: (user.e2eeKeys || []).length,
        activeKeys: (user.e2eeKeys || []).filter((k) => k.isActive).length,
        canSendEncrypted: user.e2eeEnabled && !!currentKey,
      },
    });
  } catch (error) {
    console.error("❌ Error getting E2EE info:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get E2EE info",
    });
  }
});

// 7. Enable/disable E2EE
// PATCH /users/e2ee/toggle
const toggleE2EE = async (req, res) => {
  try {
    const { keycloakId } = req.user;
    const { enabled } = req.body;

    console.log(`🔧 [toggleE2EE] User ${keycloakId}, enabled: ${enabled}`);

    const user = await User.findOne({ keycloakId });
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    user.e2eeEnabled = enabled;
    user.updatedAt = new Date();

    await user.save();

    console.log(
      `✅ [toggleE2EE] Updated user ${keycloakId} e2eeEnabled to ${enabled}`
    );

    return res.status(200).json({
      status: "success",
      message: `E2EE ${enabled ? "enabled" : "disabled"} successfully`,
      data: {
        e2eeEnabled: user.e2eeEnabled,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("❌ [toggleE2EE] Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to toggle E2EE",
      error: error.message,
    });
  }
};

// 8. Xóa một key cụ thể
// POST /users/e2ee/delete-key
const deleteE2EEKey = catchAsync(async (req, res) => {
  try {
    const { fingerprint } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🗑️ Deleting E2EE key:", { fingerprint });

    if (!fingerprint) {
      return res.status(400).json({
        status: "error",
        message: "fingerprint is required",
      });
    }

    const user = await User.findOne({ keycloakId: currentUserId });
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Tìm key
    const keyIndex = user.e2eeKeys?.findIndex(
      (key) => key.fingerprint === fingerprint
    );

    if (keyIndex === -1) {
      return res.status(404).json({
        status: "error",
        message: "Key not found",
      });
    }

    // Không cho xóa key đang active
    if (fingerprint === user.currentKeyId) {
      return res.status(400).json({
        status: "error",
        message:
          "Cannot delete active key. Please set another key as active first.",
      });
    }

    // Xóa key khỏi mảng
    user.e2eeKeys.splice(keyIndex, 1);
    await user.save();

    res.status(200).json({
      status: "success",
      message: "E2EE key deleted successfully",
      data: {
        deletedFingerprint: fingerprint,
        remainingKeys: user.e2eeKeys.length,
      },
    });
  } catch (error) {
    console.error("❌ Error deleting E2EE key:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to delete E2EE key",
    });
  }
});

// 9. Đặt một key làm active
// POST /users/e2ee/set-active-key
const setActiveE2EEKey = catchAsync(async (req, res) => {
  try {
    const { fingerprint } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🎯 Setting active E2EE key:", { fingerprint });

    if (!fingerprint) {
      return res.status(400).json({
        status: "error",
        message: "fingerprint is required",
      });
    }

    const user = await User.findOne({ keycloakId: currentUserId });
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Tìm key
    const key = user.e2eeKeys?.find((k) => k.fingerprint === fingerprint);

    if (!key) {
      return res.status(404).json({
        status: "error",
        message: "Key not found",
      });
    }

    // Đánh dấu tất cả keys là không active
    if (user.e2eeKeys && user.e2eeKeys.length > 0) {
      user.e2eeKeys.forEach((k) => {
        k.isActive = false;
      });
    }

    // Đánh dấu key mới là active
    key.isActive = true;
    user.currentKeyId = fingerprint;
    user.e2eeEnabled = true;

    await user.save();

    // Notify friends
    if (user.friends && user.friends.length > 0 && req.app.get("io")) {
      const io = req.app.get("io");
      user.friends.forEach((friendKeycloakId) => {
        io.to(friendKeycloakId).emit("friend_e2ee_key_changed", {
          userId: currentUserId,
          username: user.username,
          fingerprint: fingerprint,
          timestamp: new Date(),
        });
      });
    }

    res.status(200).json({
      status: "success",
      message: "E2EE key set as active successfully",
      data: {
        fingerprint: fingerprint,
        keyType: key.keyType,
        isActive: true,
        e2eeEnabled: user.e2eeEnabled,
      },
    });
  } catch (error) {
    console.error("❌ Error setting active E2EE key:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to set active E2EE key",
    });
  }
});

// 10. Kiểm tra E2EE status của user
// POST /users/e2ee/check-status
const checkE2EEStatus = catchAsync(async (req, res) => {
  try {
    const { userId } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🔍 Checking E2EE status for user:", userId);

    // VALIDATION
    if (!userId) {
      return res.status(400).json({
        status: "error",
        message: "userId is required",
      });
    }

    // Kiểm tra quyền truy cập
    const hasAccess = await checkE2EEAccess(currentUserId, userId);
    if (!hasAccess) {
      return res.status(403).json({
        status: "error",
        message: "Access denied",
      });
    }

    const user = await User.findOne({ keycloakId: userId });

    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    const currentKey = user.e2eeKeys?.find(
      (key) => key.fingerprint === user.currentKeyId && key.isActive
    );

    res.status(200).json({
      status: "success",
      data: {
        keycloakId: user.keycloakId,
        username: user.username,
        e2eeEnabled: user.e2eeEnabled || false,
        hasActiveKey: !!currentKey,
        canEncrypt: user.e2eeEnabled && !!currentKey,
        fingerprint: currentKey?.fingerprint,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error checking E2EE status:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to check E2EE status",
    });
  }
});

// 11. Gửi encrypted message - ĐÃ SỬA ĐỂ HỖ TRỢ CẢ CONVERSATION VÀ ROOM
// controllers/e2eeController.js - SỬA HÀM sendEncryptedMessage
const sendEncryptedMessage = catchAsync(async (req, res) => {
  console.log("🎯 [CONTROLLER] sendEncryptedMessage STARTED");
  console.log("📦 Request body:", JSON.stringify(req.body, null, 2));
  console.log("👤 User:", req.user?.keycloakId);

  try {
    const {
      roomId,
      conversation_id,
      ciphertext,
      iv,
      keyId,
      algorithm = "AES-GCM-256",
      replyTo,
      from,
      to,
    } = req.body;

    const currentUserId = req.user?.keycloakId;

    console.log("🔐 Processing encrypted message:", {
      roomId,
      conversation_id,
      from,
      to,
      currentUserId,
    });

    // XÁC ĐỊNH TARGET ID - ƯU TIÊN conversation_id
    const targetId = conversation_id || roomId;

    if (!targetId) {
      console.error("❌ No target ID found!");
      return res.status(400).json({
        status: "error",
        message: "roomId or conversation_id is required",
      });
    }

    console.log(`🎯 Target ID: ${targetId}`);

    // TÌM USER
    const user = await User.findOne({ keycloakId: currentUserId });
    if (!user) {
      console.error(`❌ User not found: ${currentUserId}`);
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    // Kiểm tra E2EE
    if (!user.e2eeEnabled) {
      console.error(`❌ User doesn't have E2EE enabled`);
      return res.status(400).json({
        status: "error",
        message: "You must enable E2EE first",
      });
    }

    // Kiểm tra active key
    const activeKey = user.e2eeKeys?.find(
      (key) => key.fingerprint === user.currentKeyId && key.isActive
    );

    if (!activeKey) {
      console.error(`❌ No active key for user`);
      return res.status(400).json({
        status: "error",
        message: "No active E2EE key found",
      });
    }

    console.log(
      `✅ User validated: ${currentUserId}, active key: ${activeKey.fingerprint}`
    );

    // ==================== XÁC ĐỊNH LOẠI CONVERSATION ====================
    console.log("🔍 Determining conversation type...");

    // THỬ TÌM TRONG OneToOneMessage TRƯỚC (direct chat)
    let conversation = await OneToOneMessage.findById(targetId);
    let isOneToOneChat = false;
    let recipientId = null;

    if (conversation) {
      console.log("✅ Found direct conversation in OneToOneMessage");
      isOneToOneChat = true;

      // Kiểm tra quyền truy cập
      if (!conversation.participants.includes(currentUserId)) {
        return res.status(403).json({
          status: "error",
          message: "Access denied to this conversation",
        });
      }

      // Xác định recipient
      recipientId = conversation.participants.find(
        (id) => id !== currentUserId
      );
      if (!recipientId && to) {
        recipientId = to;
      }

      console.log(`📱 Processing 1-1 chat with recipient: ${recipientId}`);
    } else {
      // THỬ TÌM TRONG Room (group chat)
      console.log("🔍 Checking Room model...");
      const room = await Room.findById(targetId);

      if (room) {
        console.log("✅ Found group room");
        isOneToOneChat = false;

        // Kiểm tra quyền truy cập
        if (!room.members.includes(currentUserId)) {
          return res.status(403).json({
            status: "error",
            message: "Access denied to this room",
          });
        }
      } else {
        // Nếu không tìm thấy trong cả hai, kiểm tra xem có phải là conversation mới không
        console.log("🔍 Not found in database, checking if new 1-1 chat...");

        if (to) {
          // Có recipient -> tạo conversation mới
          isOneToOneChat = true;
          recipientId = to;

          console.log(
            `🆕 Creating new 1-1 conversation between ${currentUserId} and ${recipientId}`
          );

          // Tạo conversation mới
          conversation = new OneToOneMessage({
            participants: [currentUserId, recipientId],
            messages: [],
            e2eeEnabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          await conversation.save();
          console.log(`✅ New conversation created: ${conversation._id}`);
        } else {
          console.error(
            "❌ Conversation/Room not found and no recipient specified"
          );
          return res.status(404).json({
            status: "error",
            message: "Conversation/Room not found",
          });
        }
      }
    }

    // ==================== XỬ LÝ THEO LOẠI CHAT ====================
    if (isOneToOneChat) {
      // Đảm bảo có conversation
      if (!conversation) {
        console.error("❌ Conversation is null for 1-1 chat");
        return res.status(500).json({
          status: "error",
          message: "Internal server error: Conversation not initialized",
        });
      }

      // TẠO MESSAGE
      const newMessage = {
        _id: require("uuid").v4(),
        from: currentUserId,
        to: recipientId,
        type: "encrypted",
        content: ciphertext,
        isEncrypted: true,
        encryptionData: {
          ciphertext: ciphertext,
          iv: iv,
          keyId: keyId || activeKey.fingerprint,
          algorithm: algorithm,
          timestamp: new Date(),
        },
        createdAt: new Date(),
        delivered: false,
        seen: false,
        ...(replyTo && {
          replyTo: replyTo.id,
          replyContent: replyTo.content,
          replySender: replyTo.sender,
        }),
      };

      console.log(`📝 Creating 1-1 message: ${newMessage._id}`);

      // LƯU VÀO CONVERSATION
      conversation.messages.push(newMessage);
      conversation.updatedAt = new Date();
      conversation.e2eeEnabled = true;

      await conversation.save();

      console.log(`✅ 1-1 message saved to conversation: ${conversation._id}`);

      // BROADCAST SOCKET
      const io = req.app.get("io");
      if (io) {
        // Gửi cho recipient
        const recipient = await User.findOne({ keycloakId: recipientId });
        if (recipient?.socketId) {
          io.to(recipient.socketId).emit("receive_encrypted_message", {
            messageId: newMessage._id,
            conversationId: conversation._id,
            roomId: conversation._id, // Tương thích
            senderId: currentUserId,
            ciphertext: ciphertext,
            iv: iv,
            keyId: keyId,
            algorithm: algorithm,
            timestamp: newMessage.createdAt,
            isEncrypted: true,
            type: "text",
          });
          console.log(`📤 Sent to recipient socket: ${recipient.socketId}`);
        }

        // Gửi lại cho sender
        if (user.socketId) {
          io.to(user.socketId).emit("encrypted_message_sent", {
            success: true,
            messageId: newMessage._id,
            conversationId: conversation._id,
            timestamp: newMessage.createdAt,
          });
        }
      }

      return res.status(200).json({
        status: "success",
        message: "Encrypted message sent successfully",
        data: {
          messageId: newMessage._id,
          conversationId: conversation._id,
          senderId: currentUserId,
          recipientId: recipientId,
          timestamp: newMessage.createdAt,
          chatType: "individual",
        },
      });
    } else {
      // GROUP CHAT
      console.log("👥 Processing group chat...");

      const room = await Room.findById(targetId);
      if (!room) {
        console.error(`❌ Room not found: ${targetId}`);
        return res.status(404).json({
          status: "error",
          message: "Room not found",
        });
      }

      // TẠO GROUP MESSAGE
      const messageData = {
        room: targetId,
        sender: {
          id: user.keycloakId,
          name: user.username || "Unknown",
          avatar: user.avatar,
        },
        type: "encrypted",
        content: ciphertext,
        isEncrypted: true,
        encryptionData: {
          ciphertext: ciphertext,
          iv: iv,
          keyId: keyId || activeKey.fingerprint,
          algorithm: algorithm,
          timestamp: new Date(),
        },
        replyTo: replyTo || null,
        createdAt: new Date(),
      };

      const message = await Message.create(messageData);
      console.log(`✅ Group message created: ${message._id}`);

      // CẬP NHẬT ROOM
      room.lastMessage = message._id;
      room.updatedAt = new Date();
      await room.save();

      // BROADCAST SOCKET
      const io = req.app.get("io");
      if (io) {
        const otherMembers = room.members.filter(
          (member) => member !== currentUserId
        );

        otherMembers.forEach(async (memberId) => {
          const member = await User.findOne({ keycloakId: memberId });
          if (member?.socketId) {
            io.to(member.socketId).emit("encrypted_group_message", {
              ...message.toObject(),
              incoming: true,
              outgoing: false,
            });
          }
        });

        // Gửi lại cho sender
        if (user.socketId) {
          io.to(user.socketId).emit("encrypted_group_message", {
            ...message.toObject(),
            incoming: false,
            outgoing: true,
          });
        }
      }

      return res.status(200).json({
        status: "success",
        message: "Group encrypted message sent successfully",
        data: {
          messageId: message._id,
          roomId: targetId,
          senderId: currentUserId,
          timestamp: message.createdAt,
          chatType: "group",
        },
      });
    }
  } catch (error) {
    console.error("❌ Error in sendEncryptedMessage:", error);
    console.error(error.stack);

    return res.status(500).json({
      status: "error",
      message: "Failed to send encrypted message",
      error: error.message,
    });
  }
});

// 12. Lấy encrypted messages của một room - ĐÃ SỬA VỚI CHECK ROOM ACCESS
// 12. Lấy encrypted messages - ĐÃ SỬA ĐỂ HỖ TRỢ CẢ CONVERSATION VÀ ROOM
const getEncryptedMessages = catchAsync(async (req, res) => {
  try {
    const {
      roomId, // Cho group chat
      conversation_id, // Cho 1-1 chat
      page = 1,
      limit = 50,
    } = req.body;

    const currentUserId = req.user?.keycloakId;

    console.log("🔍 Fetching encrypted messages:", {
      roomId,
      conversation_id,
      currentUserId,
      page,
      limit,
    });

    // VALIDATION
    if (!roomId && !conversation_id) {
      return res.status(400).json({
        status: "error",
        message: "roomId or conversation_id is required",
      });
    }

    // XÁC ĐỊNH LOẠI CHAT
    const chatType = roomId ? "group" : "individual";
    const targetId = roomId || conversation_id;

    console.log(`🎯 Fetching ${chatType} encrypted messages for ID:`, targetId);

    let hasAccess = false;
    let messages = [];
    let totalEncrypted = 0;
    let chatInfo = null;

    if (chatType === "group") {
      // GROUP CHAT

      // KIỂM TRA QUYỀN TRUY CẬP ROOM
      hasAccess = await checkRoomAccess(currentUserId, targetId);
      if (!hasAccess) {
        return res.status(403).json({
          status: "error",
          message: "Access denied to this room",
        });
      }

      const skip = (page - 1) * limit;

      // LẤY ENCRYPTED MESSAGES TỪ MESSAGE COLLECTION
      messages = await Message.find({
        room: targetId,
        isEncrypted: true,
        deletedAt: null,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      totalEncrypted = await Message.countDocuments({
        room: targetId,
        isEncrypted: true,
        deletedAt: null,
      });

      // Lấy thông tin room
      const room = await Room.findById(targetId);
      if (room) {
        chatInfo = {
          id: room._id,
          name: room.name,
          type: "group",
          isGroup: room.isGroup,
          members: room.members || [],
          e2eeEnabled: room.e2eeEnabled || false,
        };
      }

      console.log(`✅ Found ${messages.length} group encrypted messages`);
    } else if (chatType === "individual") {
      // 1-1 CHAT

      // TÌM CONVERSATION
      const conversation = await OneToOneMessage.findOne({
        $or: [{ _id: targetId }, { participants: { $all: [currentUserId] } }],
      });

      if (!conversation) {
        return res.status(404).json({
          status: "error",
          message: "Conversation not found",
        });
      }

      // KIỂM TRA QUYỀN TRUY CẬP
      hasAccess = conversation.participants.includes(currentUserId);
      if (!hasAccess) {
        return res.status(403).json({
          status: "error",
          message: "Access denied to this conversation",
        });
      }

      const skip = (page - 1) * limit;

      // LỌC VÀ LẤY ENCRYPTED MESSAGES TỪ CONVERSATION
      const allEncryptedMessages = conversation.messages
        .filter((msg) => msg.isEncrypted === true && !msg.deletedAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      totalEncrypted = allEncryptedMessages.length;

      // Phân trang
      messages = allEncryptedMessages.slice(skip, skip + limit).map((msg) => ({
        ...msg.toObject(),
        // Thêm metadata để tương thích
        conversationId: conversation._id,
        room: conversation._id, // Tương thích với frontend
        sender: {
          id: msg.from,
          name: msg.from === currentUserId ? "You" : "Unknown", // Cần lấy từ DB
        },
        incoming: msg.from !== currentUserId,
        outgoing: msg.from === currentUserId,
      }));

      // Lấy thông tin conversation
      chatInfo = {
        id: conversation._id,
        type: "individual",
        participants: conversation.participants,
        e2eeEnabled: conversation.e2eeEnabled,
        lastKeyExchange: conversation.lastKeyExchange,
        totalMessages: conversation.messages.length,
        totalEncryptedMessages: totalEncrypted,
      };

      console.log(`✅ Found ${messages.length} 1-1 encrypted messages`);
    }

    // LOG KẾT QUẢ
    console.log("📊 Encrypted messages results:", {
      chatType,
      targetId,
      messagesCount: messages.length,
      totalEncrypted,
      page,
      limit,
      hasAccess,
    });

    res.status(200).json({
      status: "success",
      results: messages.length,
      pagination: {
        page,
        limit,
        total: totalEncrypted,
        totalPages: Math.ceil(totalEncrypted / limit),
      },
      data: messages,
      chatInfo: chatInfo,
      chatType: chatType,
      targetId: targetId,
    });
  } catch (error) {
    console.error("❌ Error fetching encrypted messages:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch encrypted messages",
      error: error.message,
    });
  }
});

// 13. Generate key pair (cho client-side generation)
// GET /users/e2ee/generate-keypair
const generateKeyPair = catchAsync(async (req, res) => {
  try {
    res.status(200).json({
      status: "success",
      message: "Generate key pair on client-side using Web Crypto API",
      data: {
        recommendedAlgorithm: "ECDH",
        curve: "P-256",
        keyUsages: ["deriveKey", "deriveBits"],
        exportFormat: "jwk",
        exampleCode: `
// Example JavaScript code for generating key pair:
async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
  
  const publicKey = await window.crypto.subtle.exportKey(
    "jwk",
    keyPair.publicKey
  );
  
  return {
    publicKey: JSON.stringify(publicKey),
    keyType: "ecdh"
  };
}
        `,
      },
    });
  } catch (error) {
    console.error("❌ Error in generateKeyPair endpoint:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate key pair info",
    });
  }
});

// 14. Verify key fingerprint
// POST /users/e2ee/verify-fingerprint
const verifyKeyFingerprint = catchAsync(async (req, res) => {
  try {
    const { publicKey, expectedFingerprint } = req.body;

    if (!publicKey || !expectedFingerprint) {
      return res.status(400).json({
        status: "error",
        message: "publicKey and expectedFingerprint are required",
      });
    }

    const calculatedFingerprint = calculateKeyFingerprint(publicKey);
    const matches = calculatedFingerprint === expectedFingerprint;

    res.status(200).json({
      status: "success",
      data: {
        matches: matches,
        calculatedFingerprint: calculatedFingerprint,
        expectedFingerprint: expectedFingerprint,
      },
    });
  } catch (error) {
    console.error("❌ Error verifying key fingerprint:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to verify key fingerprint",
    });
  }
});

// ==================== EXPORTS ====================

module.exports = {
  // Utility functions
  calculateKeyFingerprint,
  generateExchangeId,
  checkE2EEAccess,
  checkRoomAccess, // Export hàm check room access

  // Main controller functions
  updateE2EEPublicKey,
  getUserE2EEPublicKey,
  getAllMyE2EEKeys,
  initiateE2EEKeyExchange,
  confirmE2EEKeyExchange,
  getE2EEInfo,
  toggleE2EE,
  deleteE2EEKey,
  setActiveE2EEKey,
  checkE2EEStatus,
  sendEncryptedMessage,
  getEncryptedMessages, // Đã sửa với checkRoomAccess
  generateKeyPair,
  verifyKeyFingerprint,
};
