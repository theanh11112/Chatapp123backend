// server/sockets/groupChat.js
const Room = require("../../models/room");
const User = require("../../models/user");
const AuditLog = require("../../models/auditLog");
const mongoose = require("mongoose");
const Message = require("../../models/message");

// Utility functions từ controller
const calculateKeyFingerprint = (publicKey) => {
  // Simple fingerprint calculation - bạn có thể implement phức tạp hơn
  const hash = require("crypto").createHash("sha256");
  hash.update(publicKey);
  return hash.digest("hex").substring(0, 32);
};

const generateExchangeId = (userId1, userId2) => {
  const sortedIds = [userId1, userId2].sort();
  const hash = require("crypto").createHash("sha256");
  hash.update(sortedIds.join("|") + Date.now().toString());
  return hash.digest("hex").substring(0, 16);
};

const checkE2EEAccess = async (currentUserId, targetUserId) => {
  try {
    // Kiểm tra nếu là bạn bè
    const currentUser = await User.findOne({ keycloakId: currentUserId });
    const targetUser = await User.findOne({ keycloakId: targetUserId });

    if (!currentUser || !targetUser) return false;

    // Cho phép truy cập nếu là bạn bè hoặc cùng trong group
    return (
      currentUser.friends?.includes(targetUserId) ||
      currentUser.keycloakId === targetUserId
    );
  } catch (error) {
    console.error("❌ Error checking E2EE access:", error);
    return false;
  }
};

module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;
  if (!currentUserId) return;

  // ==================== E2EE GROUP SOCKET EVENTS ====================

  // 🆕 E2EE Group Message với encryption data đầy đủ
  socket.on("encrypted_group_message", async (data, callback) => {
    try {
      const {
        roomId,
        ciphertext,
        iv,
        keyId,
        algorithm = "AES-GCM-256",
        keyFingerprint,
        replyTo,
        replyContent,
        replySender,
      } = data;

      console.log("🔐 Received encrypted_group_message:", {
        roomId,
        keyFingerprint,
        ciphertextLength: ciphertext?.length,
      });

      // VALIDATION
      if (!roomId || !ciphertext || !iv) {
        return callback?.({
          success: false,
          error: "Missing required fields: roomId, ciphertext, iv",
        });
      }

      const roomIdObj = new mongoose.Types.ObjectId(roomId);

      // Kiểm tra room và user có trong room không
      const room = await Room.findOne({
        _id: roomIdObj,
        members: currentUserId,
        isGroup: true,
      });

      if (!room) {
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // Kiểm tra nếu user có bật E2EE và có active key
      const currentUser = await User.findOne({ keycloakId: currentUserId });
      if (!currentUser?.e2eeEnabled) {
        return callback?.({
          success: false,
          error: "E2EE is not enabled for your account",
        });
      }

      // Kiểm tra active key
      const activeKey = currentUser.e2eeKeys?.find(
        (key) => key.fingerprint === currentUser.currentKeyId && key.isActive
      );

      if (!activeKey) {
        return callback?.({
          success: false,
          error: "No active E2EE key found. Please set an active key first.",
        });
      }

      // Tạo sender object đầy đủ
      const senderData = {
        id: currentUserId,
        name: socket.user?.username || currentUser.username || "Unknown",
        keycloakId: currentUserId,
        username: socket.user?.username || currentUser.username || "Unknown",
        avatar: socket.user?.avatar || currentUser.avatar || null,
      };

      // Kiểm tra nếu là reply
      const isReply = replyTo && replyContent;

      // Tạo encrypted message trong Message collection
      const messageData = {
        room: roomIdObj,
        content: ciphertext,
        type: isReply ? "encrypted_reply" : "encrypted",
        sender: senderData,
        isEncrypted: true,
        encryptionData: {
          ciphertext: ciphertext,
          iv: iv,
          keyId: keyId || activeKey.fingerprint,
          keyFingerprint: keyFingerprint || activeKey.fingerprint,
          algorithm: algorithm,
          version: "e2ee-v1",
        },
        replyTo: replyTo || null,
        replyContent: replyContent || null,
        replySender: replySender || null,
      };

      const newMessage = await Message.create(messageData);

      // Cập nhật lastMessage cho room
      await Room.findByIdAndUpdate(roomIdObj, {
        lastMessage: newMessage._id,
        updatedAt: new Date(),
      });

      console.log("✅ Encrypted group message saved to DB:", newMessage._id);

      // Chuẩn bị message data để gửi realtime
      const messageForClients = {
        _id: newMessage._id,
        id: newMessage._id.toString(),
        content: newMessage.content,
        type: newMessage.type,
        sender: senderData,
        room: roomId,
        isEncrypted: true,
        encryptionData: newMessage.encryptionData,
        createdAt: newMessage.createdAt,
        updatedAt: newMessage.updatedAt,
        replyTo: replyTo || null,
        replyContent: replyContent || null,
        replySender: replySender || null,
      };

      // Nếu là reply, thêm thông tin reply đầy đủ
      if (isReply && replyTo) {
        try {
          const repliedMessage = await Message.findById(replyTo).lean();
          if (repliedMessage) {
            messageForClients.replyTo = {
              id: repliedMessage._id,
              content: repliedMessage.content,
              sender: repliedMessage.sender,
              type: repliedMessage.type,
            };
          }
        } catch (err) {
          console.error("❌ Error populating reply info:", err);
        }
      }

      console.log("📤 Broadcasting encrypted message to room:", roomId);

      // Broadcast encrypted message đến tất cả thành viên trong room
      io.to(roomId).emit("new_encrypted_group_message", {
        roomId: roomId,
        message: messageForClients,
      });

      console.log(
        "✅ Encrypted group message sent and broadcasted successfully"
      );

      // Response success
      callback?.({
        success: true,
        message: "Encrypted group message sent successfully",
        data: messageForClients,
      });

      // Lưu audit log
      await AuditLog.create({
        user: currentUserId,
        action: "send_encrypted_group_message",
        targetId: roomId,
        metadata: {
          keyFingerprint: keyFingerprint || activeKey.fingerprint,
          algorithm,
          messageId: newMessage._id,
          roomName: room.name,
          isReply: !!isReply,
        },
      });
    } catch (err) {
      console.error("❌ Error encrypted_group_message:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // 🆕 Request E2EE public keys của tất cả thành viên trong group
  socket.on("request_group_e2ee_keys", async ({ roomId }, callback) => {
    try {
      console.log("🔑 Requesting E2EE public keys for group:", roomId);

      if (!roomId) {
        return callback?.({
          success: false,
          error: "roomId is required",
        });
      }

      const roomIdObj = new mongoose.Types.ObjectId(roomId);

      // Tìm room và lấy danh sách thành viên
      const room = await Room.findOne({
        _id: roomIdObj,
        members: currentUserId,
      });

      if (!room) {
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // Lấy thông tin chi tiết của tất cả thành viên
      const memberIds = room.members;
      const members = await User.find(
        { keycloakId: { $in: memberIds } },
        "keycloakId username e2eeEnabled currentKeyId e2eeKeys"
      ).lean();

      // Lấy E2EE public keys của tất cả thành viên có E2EE enabled
      const keys = members
        .filter(
          (member) =>
            member.keycloakId !== currentUserId &&
            member.e2eeEnabled &&
            member.currentKeyId
        )
        .map((member) => {
          const currentKey = member.e2eeKeys?.find(
            (key) =>
              key.fingerprint === member.currentKeyId &&
              !key.isRevoked &&
              (!key.expiresAt || key.expiresAt > new Date())
          );

          if (!currentKey) return null;

          return {
            keycloakId: member.keycloakId,
            username: member.username,
            publicKey: currentKey.publicKey,
            keyType: currentKey.keyType,
            fingerprint: currentKey.fingerprint,
            createdAt: currentKey.createdAt,
            expiresAt: currentKey.expiresAt,
            e2eeEnabled: member.e2eeEnabled,
            isActive: currentKey.isActive,
          };
        })
        .filter((key) => key !== null);

      console.log(`✅ Found ${keys.length} E2EE keys for group ${roomId}`);

      callback?.({
        success: true,
        roomId: roomId,
        roomName: room.name,
        keys: keys,
        totalMembers: members.length,
        e2eeMembers: keys.length,
        hasE2EECapability: keys.length > 0,
      });
    } catch (err) {
      console.error("❌ Error request_group_e2ee_keys:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // 🆕 Kiểm tra E2EE status của group
  socket.on("check_group_e2ee_status", async ({ roomId }, callback) => {
    try {
      console.log("🔍 Checking E2EE status for group:", roomId);

      if (!roomId) {
        return callback?.({
          success: false,
          error: "roomId is required",
        });
      }

      const roomIdObj = new mongoose.Types.ObjectId(roomId);

      // Kiểm tra room và quyền truy cập
      const room = await Room.findOne({
        _id: roomIdObj,
        members: currentUserId,
      });

      if (!room) {
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // Lấy thông tin tất cả thành viên
      const memberIds = room.members;
      const members = await User.find(
        { keycloakId: { $in: memberIds } },
        "keycloakId username e2eeEnabled currentKeyId"
      ).lean();

      // Phân tích E2EE status
      const e2eeAnalysis = {
        totalMembers: members.length,
        e2eeEnabledCount: members.filter((m) => m.e2eeEnabled).length,
        hasActiveKeyCount: members.filter(
          (m) => m.e2eeEnabled && m.currentKeyId
        ).length,
        members: members.map((member) => ({
          keycloakId: member.keycloakId,
          username: member.username,
          e2eeEnabled: member.e2eeEnabled || false,
          hasActiveKey: !!(member.e2eeEnabled && member.currentKeyId),
          isSelf: member.keycloakId === currentUserId,
        })),
        groupE2EECapable: members.every((m) => m.e2eeEnabled && m.currentKeyId),
        canEncryptGroup:
          members.filter(
            (m) =>
              m.keycloakId !== currentUserId && m.e2eeEnabled && m.currentKeyId
          ).length > 0,
      };

      callback?.({
        success: true,
        roomId: roomId,
        roomName: room.name,
        ...e2eeAnalysis,
      });
    } catch (err) {
      console.error("❌ Error check_group_e2ee_status:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // 🆕 E2EE Key Exchange cho group
  socket.on("initiate_group_e2ee_exchange", async ({ roomId }, callback) => {
    try {
      console.log("🔄 Initiating E2EE key exchange for group:", roomId);

      if (!roomId) {
        return callback?.({
          success: false,
          error: "roomId is required",
        });
      }

      const currentUser = await User.findOne({ keycloakId: currentUserId });
      if (!currentUser) {
        return callback?.({
          success: false,
          error: "User not found",
        });
      }

      // Kiểm tra current user có active key không
      const currentKey = currentUser.e2eeKeys?.find(
        (key) => key.fingerprint === currentUser.currentKeyId && key.isActive
      );

      if (!currentKey) {
        return callback?.({
          success: false,
          error: "You don't have an active E2EE key",
        });
      }

      const roomIdObj = new mongoose.Types.ObjectId(roomId);
      const room = await Room.findOne({
        _id: roomIdObj,
        members: currentUserId,
      });

      if (!room) {
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // Tạo exchange id cho group
      const exchangeId = require("crypto").randomBytes(16).toString("hex");

      // Broadcast exchange initiation đến tất cả thành viên
      const members = room.members.filter((member) => member !== currentUserId);

      members.forEach(async (memberKeycloakId) => {
        const member = await User.findOne({ keycloakId: memberKeycloakId });
        if (member?.socketId) {
          io.to(member.socketId).emit("group_e2ee_exchange_initiated", {
            from: currentUserId,
            fromUsername: currentUser.username,
            roomId: roomId,
            roomName: room.name,
            publicKey: currentKey.publicKey,
            keyType: currentKey.keyType,
            fingerprint: currentKey.fingerprint,
            exchangeId: exchangeId,
            timestamp: new Date(),
          });
        }
      });

      callback?.({
        success: true,
        message: "E2EE key exchange initiated for group",
        data: {
          exchangeId,
          roomId,
          publicKey: currentKey.publicKey,
          fingerprint: currentKey.fingerprint,
          keyType: currentKey.keyType,
          membersCount: members.length,
        },
      });
    } catch (err) {
      console.error("❌ Error initiate_group_e2ee_exchange:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // 🆕 Confirm E2EE key exchange cho group
  socket.on("confirm_group_e2ee_exchange", async (data, callback) => {
    try {
      const { roomId, exchangeId, publicKey, fingerprint } = data;

      console.log("✅ Confirming group E2EE key exchange:", {
        roomId,
        exchangeId,
      });

      if (!roomId || !exchangeId || !publicKey || !fingerprint) {
        return callback?.({
          success: false,
          error: "Missing required fields",
        });
      }

      const roomIdObj = new mongoose.Types.ObjectId(roomId);
      const room = await Room.findOne({
        _id: roomIdObj,
        members: currentUserId,
      });

      if (!room) {
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // Xác minh fingerprint
      const calculatedFingerprint = calculateKeyFingerprint(publicKey);
      if (calculatedFingerprint !== fingerprint) {
        return callback?.({
          success: false,
          error: "Key fingerprint mismatch",
        });
      }

      const currentUser = await User.findOne({ keycloakId: currentUserId });

      // Broadcast confirmation đến các thành viên khác trong group
      const initiatorKeycloakId = data.from; // Lấy từ data gửi lên
      if (initiatorKeycloakId && initiatorKeycloakId !== currentUserId) {
        const initiator = await User.findOne({
          keycloakId: initiatorKeycloakId,
        });
        if (initiator?.socketId) {
          io.to(initiator.socketId).emit("group_e2ee_exchange_confirmed", {
            from: currentUserId,
            fromUsername: currentUser?.username,
            roomId: roomId,
            exchangeId: exchangeId,
            fingerprint: fingerprint,
            confirmedAt: new Date(),
          });
        }
      }

      callback?.({
        success: true,
        message: "E2EE key exchange confirmed for group",
        data: {
          exchangeId,
          roomId,
          fingerprint,
          confirmedBy: currentUserId,
          confirmedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("❌ Error confirm_group_e2ee_exchange:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // 🆕 Bulk E2EE key request cho group
  socket.on("bulk_group_e2ee_keys", async ({ roomId, userIds }, callback) => {
    try {
      console.log("🔑 Bulk requesting E2EE keys for users:", userIds?.length);

      if (!roomId || !userIds || !Array.isArray(userIds)) {
        return callback?.({
          success: false,
          error: "roomId and userIds array are required",
        });
      }

      // Kiểm tra room access
      const roomIdObj = new mongoose.Types.ObjectId(roomId);
      const room = await Room.findOne({
        _id: roomIdObj,
        members: currentUserId,
      });

      if (!room) {
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // Lấy keys của các user chỉ định
      const users = await User.find(
        {
          keycloakId: { $in: userIds },
          keycloakId: { $ne: currentUserId }, // Không lấy key của chính mình
        },
        "keycloakId username e2eeEnabled currentKeyId e2eeKeys"
      ).lean();

      const keys = users
        .filter((user) => user.e2eeEnabled && user.currentKeyId)
        .map((user) => {
          const currentKey = user.e2eeKeys?.find(
            (key) =>
              key.fingerprint === user.currentKeyId &&
              !key.isRevoked &&
              (!key.expiresAt || key.expiresAt > new Date())
          );

          if (!currentKey) return null;

          return {
            keycloakId: user.keycloakId,
            username: user.username,
            publicKey: currentKey.publicKey,
            keyType: currentKey.keyType,
            fingerprint: currentKey.fingerprint,
            createdAt: currentKey.createdAt,
            expiresAt: currentKey.expiresAt,
            e2eeEnabled: user.e2eeEnabled,
          };
        })
        .filter((key) => key !== null);

      callback?.({
        success: true,
        roomId: roomId,
        requestedUserIds: userIds,
        foundUserIds: users.map((u) => u.keycloakId),
        keys: keys,
        totalRequested: userIds.length,
        totalFound: keys.length,
      });
    } catch (err) {
      console.error("❌ Error bulk_group_e2ee_keys:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // ==================== REGULAR GROUP MESSAGES ====================

  // Get Group Rooms
  socket.on("get_group_rooms", async ({ keycloakId }, callback) => {
    try {
      console.log("🔍 Fetching group rooms for user:", keycloakId);

      // Tìm các room mà user là thành viên
      const rooms = await Room.find({
        members: keycloakId,
        isActive: true,
        isGroup: true,
      })
        .populate("createdBy", "username keycloakId avatar")
        .populate("lastMessage")
        .sort({ updatedAt: -1 });

      console.log(
        `✅ Found ${rooms.length} group rooms for user ${keycloakId}`
      );

      // Format rooms data
      const formattedRooms = await Promise.all(
        rooms.map(async (room) => {
          // Lấy số lượng unread messages
          const unreadCount = await Message.countDocuments({
            room: room._id,
            "sender.keycloakId": { $ne: keycloakId },
            readBy: { $ne: keycloakId },
            createdAt: { $gt: room.lastSeen?.[keycloakId] || new Date(0) },
          });

          return {
            ...room.toObject(),
            unreadCount,
            lastSeen: room.lastSeen?.[keycloakId] || null,
          };
        })
      );

      callback?.(formattedRooms);
    } catch (err) {
      console.error("❌ Error get_group_rooms:", err);
      callback?.([]);
    }
  });

  // Get Group Messages
  socket.on(
    "get_group_messages",
    async ({ roomId, limit = 50, before = null }, callback) => {
      try {
        console.log("📨 Fetching messages for room:", roomId);

        if (!roomId) {
          return callback?.([]);
        }

        const roomIdObj = new mongoose.Types.ObjectId(roomId);

        // Kiểm tra room access
        const room = await Room.findOne({
          _id: roomIdObj,
          members: currentUserId,
        });

        if (!room) {
          console.log("❌ Room not found or access denied:", roomId);
          return callback?.([]);
        }

        // Tạo query
        const query = {
          room: roomIdObj,
          deletedAt: null,
        };

        if (before) {
          query.createdAt = { $lt: new Date(before) };
        }

        // Lấy messages
        const messages = await Message.find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();

        // Đảo ngược để có thứ tự cũ → mới
        const sortedMessages = messages.reverse();

        console.log(
          `✅ Found ${sortedMessages.length} messages in room ${roomId}`
        );

        callback?.(sortedMessages);
      } catch (err) {
        console.error("❌ Error get_group_messages:", err);
        callback?.([]);
      }
    }
  );

  // Group Message
  socket.on("group_message", async (data, callback) => {
    try {
      console.log("📨 Received group_message:", data);

      const {
        roomId,
        message,
        type = "text",
        replyTo,
        replyContent,
        replySender,
      } = data;

      if (!roomId || !message) {
        return callback?.({
          success: false,
          error: "Missing roomId or message",
        });
      }

      const roomIdObj = new mongoose.Types.ObjectId(roomId);

      // Kiểm tra room tồn tại và user có trong room không
      const room = await Room.findOne({
        _id: roomIdObj,
        members: currentUserId,
      });

      if (!room) {
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // Tạo sender object
      const currentUser = await User.findOne({ keycloakId: currentUserId });
      const senderData = {
        id: currentUserId,
        name: socket.user?.username || currentUser?.username || "Unknown",
        keycloakId: currentUserId,
        username: socket.user?.username || currentUser?.username || "Unknown",
        avatar: socket.user?.avatar || currentUser?.avatar || null,
      };

      // Kiểm tra nếu là reply
      const isReply = replyTo && replyContent;

      // Tạo message
      const messageData = {
        room: roomIdObj,
        content: message,
        type: isReply ? "reply" : type,
        sender: senderData,
        replyTo: replyTo || null,
        replyContent: replyContent || null,
        replySender: replySender || null,
      };

      const newMessage = await Message.create(messageData);

      // Cập nhật lastMessage cho room
      await Room.findByIdAndUpdate(roomIdObj, {
        lastMessage: newMessage._id,
        updatedAt: new Date(),
      });

      // Chuẩn bị message data để gửi realtime
      const messageForClients = {
        _id: newMessage._id,
        id: newMessage._id.toString(),
        content: newMessage.content,
        type: newMessage.type,
        sender: senderData,
        room: roomId,
        createdAt: newMessage.createdAt,
        updatedAt: newMessage.updatedAt,
        replyTo: replyTo || null,
        replyContent: replyContent || null,
        replySender: replySender || null,
      };

      // Nếu là reply, thêm thông tin reply đầy đủ
      if (isReply && replyTo) {
        try {
          const repliedMessage = await Message.findById(replyTo).lean();
          if (repliedMessage) {
            messageForClients.replyTo = {
              id: repliedMessage._id,
              content: repliedMessage.content,
              sender: repliedMessage.sender,
              type: repliedMessage.type,
            };
          }
        } catch (err) {
          console.error("❌ Error populating reply info:", err);
        }
      }

      // Broadcast message đến tất cả thành viên trong room
      io.to(roomId).emit("new_group_message", {
        roomId: roomId,
        message: messageForClients,
      });

      callback?.({
        success: true,
        message: "Group message sent successfully",
        data: messageForClients,
      });
    } catch (err) {
      console.error("❌ Error group_message:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // Delete Group Message
  socket.on("delete_group_message", async ({ messageId, roomId }, callback) => {
    try {
      console.log("🗑️ delete_group_message:", { messageId, roomId });

      if (!messageId || !roomId) {
        return callback?.({
          success: false,
          error: "messageId and roomId are required",
        });
      }

      // Kiểm tra message tồn tại
      const message = await Message.findById(messageId);
      if (!message) {
        return callback?.({
          success: false,
          error: "Message not found",
        });
      }

      // Kiểm tra quyền xóa (chỉ cho phép người gửi xóa)
      if (message.sender.keycloakId !== currentUserId) {
        return callback?.({
          success: false,
          error: "You can only delete your own messages",
        });
      }

      // Kiểm tra message có thuộc room không
      if (message.room.toString() !== roomId) {
        return callback?.({
          success: false,
          error: "Message does not belong to this room",
        });
      }

      // Kiểm tra thời gian xóa (trong vòng 1 giờ)
      const messageAge = Date.now() - new Date(message.createdAt).getTime();
      const oneHour = 60 * 60 * 1000;

      if (messageAge > oneHour) {
        return callback?.({
          success: false,
          error: "You can only delete messages within 1 hour of sending",
        });
      }

      // Đánh dấu xóa (soft delete)
      message.deletedAt = new Date();
      await message.save();

      // Broadcast deletion event
      io.to(roomId).emit("group_message_deleted", {
        messageId: messageId,
        roomId: roomId,
        deletedBy: currentUserId,
        deletedAt: message.deletedAt,
      });

      callback?.({
        success: true,
        message: "Message deleted successfully",
      });
    } catch (err) {
      console.error("❌ Error delete_group_message:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // ==================== ROOM MANAGEMENT ====================

  // Join Group Room
  socket.on("join_group_room", async ({ roomId }) => {
    try {
      console.log("🔗 User joining group room:", {
        userId: currentUserId,
        roomId,
      });

      if (!roomId) return;

      // Kiểm tra user có trong room không
      const room = await Room.findOne({
        _id: roomId,
        members: currentUserId,
      });

      if (!room) {
        console.log("❌ User not in room or room not found");
        return;
      }

      // Join socket room
      socket.join(roomId);

      // Cập nhật lastSeen
      await Room.findByIdAndUpdate(roomId, {
        [`lastSeen.${currentUserId}`]: new Date(),
      });

      console.log(`✅ User ${currentUserId} joined room ${roomId}`);

      // Thông báo user online
      socket.to(roomId).emit("user_joined_room", {
        roomId,
        user: {
          keycloakId: currentUserId,
          username: socket.user.username,
          avatar: socket.user.avatar,
        },
        joinedAt: new Date(),
      });
    } catch (err) {
      console.error("❌ Error join_group_room:", err);
    }
  });

  // Leave Group Room
  socket.on("leave_group_room", async ({ roomId }) => {
    try {
      console.log("🚪 User leaving group room:", {
        userId: currentUserId,
        roomId,
      });

      if (!roomId) return;

      socket.leave(roomId);

      // Thông báo user left
      socket.to(roomId).emit("user_left_room", {
        roomId,
        user: {
          keycloakId: currentUserId,
          username: socket.user.username,
        },
        leftAt: new Date(),
      });
    } catch (err) {
      console.error("❌ Error leave_group_room:", err);
    }
  });

  // ==================== TYPING INDICATORS ====================

  socket.on("group_typing_start", ({ roomId }) => {
    if (roomId) {
      socket.to(roomId).emit("group_typing_start", {
        roomId,
        user: {
          keycloakId: currentUserId,
          username: socket.user.username,
          avatar: socket.user.avatar,
        },
        timestamp: new Date(),
      });
    }
  });

  socket.on("group_typing_stop", ({ roomId }) => {
    if (roomId) {
      socket.to(roomId).emit("group_typing_stop", {
        roomId,
        user: {
          keycloakId: currentUserId,
          username: socket.user.username,
          avatar: socket.user.avatar,
        },
        timestamp: new Date(),
      });
    }
  });

  // ==================== MESSAGE STATUS ====================

  socket.on("group_message_read", async ({ roomId, messageIds }) => {
    try {
      if (!roomId || !messageIds || !Array.isArray(messageIds)) return;

      // Cập nhật lastSeen cho room
      await Room.findByIdAndUpdate(roomId, {
        [`lastSeen.${currentUserId}`]: new Date(),
      });

      // Broadcast read receipt
      socket.to(roomId).emit("group_message_read_receipt", {
        roomId,
        readBy: {
          keycloakId: currentUserId,
          username: socket.user.username,
        },
        messageIds,
        readAt: new Date(),
      });
    } catch (err) {
      console.error("❌ Error group_message_read:", err);
    }
  });

  // ==================== E2EE STATUS UPDATES ====================

  // Lắng nghe E2EE status changes từ user
  socket.on("user_e2ee_status_changed", async ({ e2eeEnabled }) => {
    try {
      // Thông báo cho tất cả group rooms mà user tham gia
      const rooms = await Room.find({
        members: currentUserId,
        isGroup: true,
      });

      rooms.forEach((room) => {
        socket.to(room._id.toString()).emit("group_member_e2ee_changed", {
          roomId: room._id,
          user: {
            keycloakId: currentUserId,
            username: socket.user.username,
          },
          e2eeEnabled: e2eeEnabled,
          timestamp: new Date(),
        });
      });
    } catch (err) {
      console.error("❌ Error user_e2ee_status_changed:", err);
    }
  });
};
