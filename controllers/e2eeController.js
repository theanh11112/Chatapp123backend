// controllers/e2eeController.js - HOÀN CHỈNH VERSION
const crypto = require("crypto");
const User = require("../models/user");
const Message = require("../models/message");
const Room = require("../models/room");
const catchAsync = require("../utils/catchAsync");

/*
|--------------------------------------------------------------------------
| E2EE UTILITY FUNCTIONS
|--------------------------------------------------------------------------
*/

// Helper: Tính fingerprint của key
const calculateKeyFingerprint = (publicKey) => {
  return crypto
    .createHash("sha256")
    .update(publicKey)
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
const checkRoomAccess = async (keycloakId, roomId) => {
  try {
    console.log(
      `🔍 [checkRoomAccess] Checking access for keycloakId: ${keycloakId} to room: ${roomId}`
    );

    // KHÔNG CẦN TÌM USER - trực tiếp tìm room với keycloakId
    const room = await Room.findOne({
      _id: roomId,
      members: keycloakId, // So sánh trực tiếp với keycloakId
    });

    if (room) {
      console.log(
        `✅ [checkRoomAccess] Access GRANTED for ${keycloakId} to room ${roomId}`
      );
      console.log(
        `   Room name: ${room.name}, Members count: ${room.members.length}`
      );
      return true;
    } else {
      console.log(
        `❌ [checkRoomAccess] Access DENIED for ${keycloakId} to room ${roomId}`
      );

      // Debug: Kiểm tra room có tồn tại không
      const roomExists = await Room.findById(roomId);
      if (roomExists) {
        console.log(`ℹ️  Room exists but ${keycloakId} not in members`);
        console.log(`   Room members: ${JSON.stringify(roomExists.members)}`);
      } else {
        console.log(`ℹ️  Room does not exist: ${roomId}`);
      }
      return false;
    }
  } catch (error) {
    console.error("❌ [checkRoomAccess] Error:", error.message);
    return false;
  }
};

// ==================== CONTROLLER FUNCTIONS ====================

// 1. Cập nhật E2EE public key cho user
// POST /users/e2ee/update-key
const updateE2EEPublicKey = catchAsync(async (req, res) => {
  try {
    const { publicKey, keyType = "ecdh" } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🔑 Updating E2EE public key for user:", currentUserId);

    // VALIDATION
    if (!publicKey) {
      return res.status(400).json({
        status: "error",
        message: "publicKey is required",
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

    // Kiểm tra nếu key đã tồn tại
    const existingKey = user.e2eeKeys?.find(
      (key) => key.fingerprint === fingerprint
    );

    if (existingKey) {
      if (existingKey.isRevoked) {
        // Reactivate revoked key
        existingKey.isRevoked = false;
        existingKey.revokedAt = null;
        existingKey.revokedReason = null;
      } else {
        return res.status(400).json({
          status: "error",
          message: "Public key already exists",
          data: { fingerprint },
        });
      }
    }

    // Đánh dấu tất cả keys cũ là không active
    if (user.e2eeKeys && user.e2eeKeys.length > 0) {
      user.e2eeKeys.forEach((key) => {
        key.isActive = false;
      });
    }

    // Thêm key mới
    const newKey = {
      publicKey: publicKey,
      keyType: keyType,
      fingerprint: fingerprint,
      createdAt: new Date(),
      isActive: true,
    };

    // Thêm vào mảng keys
    user.e2eeKeys = user.e2eeKeys || [];
    user.e2eeKeys.push(newKey);

    // Cập nhật current key
    user.currentKeyId = fingerprint;
    user.e2eeEnabled = true;

    await user.save();

    console.log("✅ E2EE public key updated for user:", currentUserId);

    // Notify friends about new key
    if (user.friends && user.friends.length > 0 && req.app.get("io")) {
      const io = req.app.get("io");
      user.friends.forEach((friendKeycloakId) => {
        io.to(friendKeycloakId).emit("friend_e2ee_key_updated", {
          userId: currentUserId,
          username: user.username,
          fingerprint: fingerprint,
          keyType: keyType,
          timestamp: new Date(),
        });
      });
    }

    res.status(200).json({
      status: "success",
      message: "E2EE public key updated successfully",
      data: {
        fingerprint: newKey.fingerprint,
        keyType: newKey.keyType,
        createdAt: newKey.createdAt,
        e2eeEnabled: user.e2eeEnabled,
      },
    });
  } catch (error) {
    console.error("❌ Error updating E2EE public key:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to update E2EE public key",
    });
  }
});

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

// 11. Gửi encrypted message - ĐÃ SỬA VỚI CHECK ROOM ACCESS
const sendEncryptedMessage = catchAsync(async (req, res) => {
  try {
    const {
      roomId,
      ciphertext,
      iv,
      keyId,
      algorithm = "AES-GCM-256",
      replyTo,
    } = req.body;

    const currentUserId = req.user?.keycloakId;

    console.log("🔐 Sending encrypted message to room:", roomId);

    // VALIDATION
    if (!roomId || !ciphertext || !iv) {
      return res.status(400).json({
        status: "error",
        message: "roomId, ciphertext, and iv are required",
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

    // Kiểm tra user có E2EE enabled không
    if (!user.e2eeEnabled) {
      return res.status(400).json({
        status: "error",
        message: "You must enable E2EE first",
      });
    }

    // Kiểm tra user có active key không
    const activeKey = user.e2eeKeys?.find(
      (key) => key.fingerprint === user.currentKeyId && key.isActive
    );

    if (!activeKey) {
      return res.status(400).json({
        status: "error",
        message: "No active E2EE key found",
      });
    }

    // KIỂM TRA QUYỀN TRUY CẬP ROOM
    const hasRoomAccess = await checkRoomAccess(currentUserId, roomId);
    if (!hasRoomAccess) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to this room",
      });
    }

    // Tìm room để lấy thông tin
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        status: "error",
        message: "Room not found",
      });
    }

    // TẠO ENCRYPTED MESSAGE
    const messageData = {
      room: roomId,
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
      },
      replyTo: replyTo || null,
    };

    const message = await Message.create(messageData);

    // CẬP NHẬT ROOM LAST MESSAGE
    await Room.findByIdAndUpdate(roomId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    console.log("✅ Encrypted message created:", message._id);

    // REAL-TIME SOCKET EMIT
    const io = req.app.get("io");
    if (io) {
      const eventName = room.isGroup
        ? "encrypted_group_message"
        : "encrypted_message";

      const messageForSocket = {
        ...message.toObject(),
        incoming: false,
        outgoing: true,
      };

      // Gửi cho tất cả members trong room (trừ người gửi)
      const members = room.members || [];
      const otherMembers = members.filter((member) => member !== currentUserId);

      otherMembers.forEach(async (memberKeycloakId) => {
        const member = await User.findOne({ keycloakId: memberKeycloakId });
        if (member?.socketId) {
          io.to(member.socketId).emit(eventName, {
            ...messageForSocket,
            incoming: true,
            outgoing: false,
          });
        }
      });

      // Gửi lại cho sender để confirm
      if (user.socketId) {
        io.to(user.socketId).emit(eventName, messageForSocket);
      }
    }

    res.status(200).json({
      status: "success",
      message: "Encrypted message sent successfully",
      data: message,
    });
  } catch (error) {
    console.error("❌ Error sending encrypted message:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to send encrypted message",
      error: error.message,
    });
  }
});

// 12. Lấy encrypted messages của một room - ĐÃ SỬA VỚI CHECK ROOM ACCESS
const getEncryptedMessages = catchAsync(async (req, res) => {
  try {
    const { roomId, page = 1, limit = 50 } = req.body;
    const currentUserId = req.user?.keycloakId;

    console.log("🔍 Fetching encrypted messages for room:", roomId);

    // VALIDATION
    if (!roomId) {
      return res.status(400).json({
        status: "error",
        message: "roomId is required",
      });
    }

    // KIỂM TRA QUYỀN TRUY CẬP ROOM
    const hasRoomAccess = await checkRoomAccess(currentUserId, roomId);
    if (!hasRoomAccess) {
      return res.status(403).json({
        status: "error",
        message: "Access denied to this room",
      });
    }

    const skip = (page - 1) * limit;

    // LẤY ENCRYPTED MESSAGES
    const messages = await Message.find({
      room: roomId,
      isEncrypted: true,
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(
      `✅ Found ${messages.length} encrypted messages for room ${roomId}`
    );

    res.status(200).json({
      status: "success",
      results: messages.length,
      pagination: { page, limit, total: messages.length },
      data: messages,
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
