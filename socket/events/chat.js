// server/sockets/directChat.js
const User = require("../../models/user");
const OneToOneMessage = require("../../models/OneToOneMessage");
const FriendRequest = require("../../models/friendRequest");
const AuditLog = require("../../models/auditLog");
const { pushMessage } = require("../../models/OneToOneMessage.helper");
const { v4: uuidv4 } = require("uuid");

// 🆕 THÊM: Import Message model để đồng bộ với schema mới
const Message = require("../../models/message");
// 🆕 THÊM: Import Room model cho E2EE
const Room = require("../../models/room");

module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;
  if (!currentUserId)
    return console.warn("Socket connected without user info!");

  const ALLOWED_MSG_TYPES = ["text", "image", "file", "video", "system"];

  console.log(
    "⚙️ Direct chat events loaded for user:",
    socket.user.username,
    currentUserId
  );

  // ==================== E2EE DIRECT MESSAGE FUNCTIONS ====================

  // 🆕 THÊM: Gửi encrypted direct message
  socket.on("encrypted_direct_message", async (data, callback) => {
    try {
      const {
        to,
        ciphertext,
        iv,
        keyId,
        algorithm = "AES-GCM-256",
        keyFingerprint,
        replyTo,
      } = data;

      console.log("🔐 Received encrypted_direct_message:", {
        to,
        keyFingerprint,
        ciphertextLength: ciphertext?.length,
      });

      // VALIDATION
      if (!to || !ciphertext || !iv) {
        return callback?.({
          success: false,
          error: "Missing required fields: to, ciphertext, iv",
        });
      }

      // Kiểm tra người gửi có E2EE enabled không
      const currentUser = await User.findOne({ keycloakId: currentUserId });
      if (!currentUser?.e2eeEnabled) {
        return callback?.({
          success: false,
          error: "E2EE is not enabled for your account",
        });
      }

      // Kiểm tra người nhận có E2EE enabled không
      const recipient = await User.findOne({ keycloakId: to });
      if (!recipient?.e2eeEnabled) {
        return callback?.({
          success: false,
          error: "Recipient does not have E2EE enabled",
        });
      }

      // Tìm hoặc tạo room cho direct chat
      const room = await Room.findOne({
        isGroup: false,
        members: { $all: [currentUserId, to] },
      });

      let roomId;

      if (!room) {
        // Tạo room mới
        const newRoom = await Room.create({
          name: null,
          isGroup: false,
          members: [currentUserId, to],
          createdBy: currentUserId,
        });
        roomId = newRoom._id;
        console.log("✅ Created new room for direct chat:", roomId);
      } else {
        roomId = room._id;
        console.log("✅ Found existing room:", roomId);
      }

      // Tạo sender object đầy đủ
      const senderData = {
        id: currentUserId,
        name: socket.user?.username || "Unknown",
        avatar: socket.user?.avatar || null,
      };

      // Tạo encrypted message trong Message collection
      const newMessage = await Message.create({
        room: roomId,
        content: ciphertext,
        type: "encrypted",
        sender: senderData,
        isEncrypted: true,
        encryptionData: {
          ciphertext: ciphertext,
          iv: iv,
          keyId: keyId || null,
          keyFingerprint: keyFingerprint,
          algorithm: algorithm,
        },
        replyTo: replyTo || null,
      });

      // Cập nhật lastMessage cho room
      await Room.findByIdAndUpdate(roomId, {
        lastMessage: newMessage._id,
        updatedAt: new Date(),
      });

      console.log("✅ Encrypted direct message saved to DB:", newMessage._id);

      // Chuẩn bị message data để gửi realtime
      const messageForClients = {
        _id: newMessage._id,
        id: newMessage._id.toString(),
        content: newMessage.content,
        type: "encrypted",
        sender: {
          id: currentUserId,
          name: socket.user?.username || "Unknown",
          avatar: socket.user?.avatar || null,
        },
        room: roomId,
        isEncrypted: true,
        encryptionData: newMessage.encryptionData,
        createdAt: newMessage.createdAt,
        updatedAt: newMessage.updatedAt,
        replyTo: replyTo || null,
      };

      console.log("📤 Sending encrypted message to recipient:", to);

      // Gửi encrypted message cho người nhận
      if (recipient?.socketId) {
        io.to(recipient.socketId).emit("new_encrypted_message", {
          from: currentUserId,
          message: messageForClients,
          incoming: true,
          outgoing: false,
        });
      }

      // Gửi lại cho sender để confirm
      socket.emit("new_encrypted_message", {
        from: currentUserId,
        message: messageForClients,
        incoming: false,
        outgoing: true,
      });

      console.log("✅ Encrypted direct message sent successfully");

      // Response success
      callback?.({
        success: true,
        message: "Encrypted direct message sent successfully",
        data: messageForClients,
      });

      // Lưu audit log
      await AuditLog.create({
        user: currentUserId,
        action: "send_encrypted_direct_message",
        targetId: to,
        metadata: {
          keyFingerprint,
          algorithm,
          messageId: newMessage._id,
        },
      });
    } catch (err) {
      console.error("❌ Error encrypted_direct_message:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // 🆕 THÊM: Get E2EE public key của bạn bè
  socket.on("get_friend_e2ee_key", async ({ friendId }, callback) => {
    try {
      console.log("🔑 Getting E2EE public key for friend:", friendId);

      if (!friendId) {
        return callback?.({
          success: false,
          error: "friendId is required",
        });
      }

      // Kiểm tra có phải bạn bè không
      const currentUser = await User.findOne({ keycloakId: currentUserId });
      if (!currentUser.friends.includes(friendId)) {
        return callback?.({
          success: false,
          error: "User is not your friend",
        });
      }

      const friend = await User.findOne({ keycloakId: friendId });
      if (!friend) {
        return callback?.({
          success: false,
          error: "Friend not found",
        });
      }

      if (!friend.e2eeEnabled) {
        return callback?.({
          success: false,
          error: "Friend does not have E2EE enabled",
        });
      }

      // Lấy current active key
      const currentKey = friend.e2eeKeys?.find(
        (key) => key.fingerprint === friend.currentKeyId && key.isActive
      );

      if (!currentKey) {
        return callback?.({
          success: false,
          error: "Friend does not have an active E2EE key",
        });
      }

      callback?.({
        success: true,
        data: {
          keycloakId: friend.keycloakId,
          username: friend.username,
          publicKey: currentKey.publicKey,
          keyType: currentKey.keyType,
          fingerprint: currentKey.fingerprint,
          createdAt: currentKey.createdAt,
          e2eeEnabled: friend.e2eeEnabled,
        },
      });
    } catch (err) {
      console.error("❌ Error get_friend_e2ee_key:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // 🆕 THÊM: Helper function để kiểm tra E2EE access
  const checkE2EEAccess = async (userId, targetUserId) => {
    try {
      if (userId === targetUserId) return true;

      const user = await User.findOne({ keycloakId: userId });
      if (user && user.friends && user.friends.includes(targetUserId)) {
        return true;
      }

      const Room = require("../../models/room");
      const sharedRooms = await Room.find({
        isGroup: true,
        members: { $all: [userId, targetUserId] },
      }).limit(1);

      return sharedRooms.length > 0;
    } catch (error) {
      console.error("❌ Error checking E2EE access:", error);
      return false;
    }
  };

  // ==================== DIRECT CHAT SPECIFIC EVENTS ====================

  // ---------------- Start Conversation ----------------
  socket.on("start_conversation", async (data, callback) => {
    try {
      const { to, from } = data;

      console.log("💬 Starting conversation:", { to, from });

      // VALIDATION
      if (!to || !from) {
        const errorMsg = "Missing required fields: to and from";
        console.log("❌", errorMsg);
        socket.emit("conversation_error", { message: errorMsg });
        return callback?.({ success: false, error: errorMsg });
      }

      if (to === from) {
        const errorMsg = "Cannot start conversation with yourself";
        console.log("❌", errorMsg);
        socket.emit("conversation_error", { message: errorMsg });
        return callback?.({ success: false, error: errorMsg });
      }

      // KIỂM TRA USERS TỒN TẠI
      const [user1, user2] = await Promise.all([
        User.findOne({ keycloakId: from }),
        User.findOne({ keycloakId: to }),
      ]);

      if (!user1 || !user2) {
        const errorMsg = "One or both users not found";
        console.log("❌", errorMsg);
        socket.emit("conversation_error", { message: errorMsg });
        return callback?.({ success: false, error: errorMsg });
      }

      // KIỂM TRA ĐÃ CÓ CONVERSATION CHƯA
      let conversation = await OneToOneMessage.findOne({
        participants: { $all: [from, to] },
      });

      if (!conversation) {
        // TẠO CONVERSATION MỚI
        conversation = await OneToOneMessage.create({
          participants: [from, to],
          messages: [],
        });
        console.log("✅ New conversation created:", conversation._id);
      } else {
        console.log("✅ Existing conversation found:", conversation._id);
      }

      // POPULATE THÔNG TIN USER CHO FRONTEND
      const participantsInfo = await Promise.all(
        conversation.participants.map(async (participantId) => {
          const user = await User.findOne({ keycloakId: participantId }).select(
            "keycloakId username fullName avatar status lastSeen email e2eeEnabled"
          );
          return user;
        })
      );

      const conversationWithUserInfo = {
        _id: conversation._id,
        participants: participantsInfo,
        messages: conversation.messages,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      };

      // TÌM SOCKET ID CỦA NGƯỜI NHẬN
      const toUser = await User.findOne({ keycloakId: to });

      // EMIT SỰ KIỆN CHO CẢ 2 USERS
      const successData = {
        conversation: conversationWithUserInfo,
        message: "Conversation started successfully",
      };

      // Gửi cho người khởi tạo
      socket.emit("conversation_started", successData);
      console.log(`📤 Emitted conversation_started to sender: ${from}`);

      // Gửi cho user kia (nếu online)
      if (toUser?.socketId) {
        io.to(toUser.socketId).emit("conversation_started", successData);
        console.log(`📤 Emitted conversation_started to receiver: ${to}`);
      } else {
        console.log(`📭 Receiver ${to} is offline`);
      }

      // Lưu audit log
      await AuditLog.create({
        user: from,
        action: "start_conversation",
        targetId: to,
        metadata: {
          conversationId: conversation._id,
          participants: [from, to],
        },
      });

      console.log("✅ Conversation started successfully:", conversation._id);

      // Callback success
      callback?.({
        success: true,
        conversation: conversationWithUserInfo,
        message: "Conversation started successfully",
      });
    } catch (error) {
      console.error("❌ Error starting conversation:", error);
      const errorMsg = "Failed to start conversation";
      socket.emit("conversation_error", { message: errorMsg });
      callback?.({ success: false, error: errorMsg });
    }
  });

  // ---------------- Get Direct Conversations ----------------
  socket.on("get_direct_conversations", async ({ keycloakId }, callback) => {
    try {
      // 1) Lấy danh sách conversation
      const conversations = await OneToOneMessage.find({
        participants: { $in: [keycloakId] },
      });

      if (!conversations.length) return callback([]);

      // 2) Tập hợp tất cả id user xuất hiện trong conversations
      const allUserIds = [
        ...new Set(conversations.flatMap((c) => c.participants)),
      ];

      // 3) Lấy thông tin user
      const users = await User.find({
        keycloakId: { $in: allUserIds },
      }).select(
        "username email keycloakId avatar socketId status lastSeen e2eeEnabled"
      );

      // 4) Map userId → thông tin user
      const userMap = {};
      users.forEach((u) => {
        userMap[u.keycloakId] = {
          keycloakId: u.keycloakId,
          username: u.username,
          email: u.email,
          avatar: u.avatar,
          status: u.status || "Offline",
          lastSeen: u.lastSeen || null,
          e2eeEnabled: u.e2eeEnabled || false,
        };
      });

      // 5) Gắn lại participants thành object đầy đủ
      const finalResult = conversations.map((conv) => ({
        ...conv.toObject(),
        participants: conv.participants.map(
          (uid) => userMap[uid] || { keycloakId: uid }
        ),
      }));

      callback(finalResult);
    } catch (err) {
      console.error("Error get_direct_conversations:", err);
      callback([]);
    }
  });

  // ---------------- Get Messages of a Conversation ----------------
  socket.on("get_direct_messages", async ({ conversation_id }, callback) => {
    try {
      if (!conversation_id) return callback?.([]);

      const conversation = await OneToOneMessage.findById(conversation_id);
      if (!conversation) return callback?.([]);

      callback(conversation.messages);
    } catch (err) {
      console.error("Error get_direct_messages:", err);
      callback([]);
    }
  });

  // ---------------- Send Message ----------------
  socket.on(
    "text_message",
    async ({ id, conversation_id, to, message, type }, callback) => {
      try {
        if (!to || !message) {
          return callback?.({
            success: false,
            error: "Missing required fields",
          });
        }

        const toId = to.toString();
        const msgType =
          type && ALLOWED_MSG_TYPES.includes(type.trim().toLowerCase())
            ? type.trim().toLowerCase()
            : "text";

        // Tạo message object
        const newMessage = {
          _id: id || uuidv4(),
          from: currentUserId,
          to: toId,
          type: msgType,
          content: message,
          createdAt: new Date(),
          seen: false,
        };
        console.log("📨 Received text_message:", newMessage);

        // Dùng pushMessage
        const chat = await pushMessage([currentUserId, toId], newMessage);

        // Tạo message data để gửi realtime
        const messageData = {
          _id: newMessage._id,
          id: newMessage._id,
          message: message,
          content: message,
          type: "msg",
          subtype: msgType,
          from: currentUserId,
          to: toId,
          conversation_id: chat._id.toString(),
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          createdAt: newMessage.createdAt,
          incoming: false,
          outgoing: true,
          attachments: [],
          sender: {
            keycloakId: currentUserId,
            username: socket.user?.username || "Unknown",
            name: socket.user?.name || socket.user?.username || "Unknown",
          },
        };

        console.log("✅ Prepared message data for realtime:", {
          conversation_id: chat._id,
          message_id: messageData.id,
          from: currentUserId,
          to: toId,
        });

        // Gửi event "text_message"
        const toUser = await User.findOne({ keycloakId: toId });

        if (toUser?.socketId) {
          console.log("🚀 Emitting text_message to receiver:", toUser.socketId);
          io.to(toUser.socketId).emit("text_message", {
            ...messageData,
            incoming: true,
            outgoing: false,
          });
        }

        // Gửi lại cho sender để confirm
        console.log("🚀 Emitting text_message to sender:", socket.id);
        socket.emit("text_message", messageData);

        // Lưu audit log
        await AuditLog.create({
          user: currentUserId,
          action: "send_message",
          targetId: toId,
          metadata: { message },
        });

        callback?.({ success: true, message: "Sent" });
      } catch (err) {
        console.error("Error text_message:", err);
        callback?.({ success: false, error: err.message });
      }
    }
  );

  // ---------------- Send Reply Message ----------------
  socket.on("text_message_reply", async (data, callback) => {
    try {
      console.log("📨 Received text_message_reply:", data);

      const {
        conversation_id,
        message,
        from,
        to,
        messageId,
        replyTo,
        replyContent,
        replySender,
      } = data;

      // Validate required fields
      if (!conversation_id || !message || !from || !to || !replyTo) {
        console.log("❌ Missing required fields for reply");
        return callback?.({
          success: false,
          error: "Missing required fields",
        });
      }

      const conversation = await OneToOneMessage.findById(conversation_id);

      if (!conversation) {
        console.log("❌ Conversation not found:", conversation_id);
        return callback?.({
          success: false,
          error: "Conversation not found",
        });
      }

      // Tạo message với type "reply"
      const newMessage = {
        _id: messageId || uuidv4(),
        from: from,
        to: to,
        type: "reply",
        content: message,
        replyTo: replyTo,
        replyContent: replyContent,
        replySender: replySender,
        createdAt: new Date(),
      };

      conversation.messages.push(newMessage);
      await conversation.save();

      console.log("✅ Direct reply message saved to DB:", newMessage._id);

      // Tạo message data
      const messageData = {
        _id: newMessage._id,
        id: newMessage._id.toString(),
        message: message,
        content: message,
        type: "msg",
        subtype: "reply",
        from: from,
        to: to,
        conversation_id: conversation_id,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        createdAt: newMessage.createdAt,
        incoming: false,
        outgoing: true,
        attachments: [],
        replyTo: {
          id: replyTo,
          content: replyContent,
          sender: replySender,
        },
        sender: {
          keycloakId: from,
          username: data.sender?.username || "Unknown",
          name: data.sender?.name || data.sender?.username || "Unknown",
        },
      };

      console.log("✅ Prepared reply message data for realtime:", {
        conversation_id: conversation_id,
        message_id: messageData.id,
        from: from,
        to: to,
        is_reply: true,
      });

      // Gửi event cho receiver
      const toUser = await User.findOne({ keycloakId: to });
      if (toUser?.socketId) {
        io.to(toUser.socketId).emit("text_message_reply", {
          ...messageData,
          incoming: true,
          outgoing: false,
        });
      }

      // Gửi lại cho sender
      socket.emit("text_message_reply", messageData);

      console.log("✅ Direct reply message sent successfully");

      callback?.({
        success: true,
        message: "Reply message sent successfully",
        data: messageData,
      });
    } catch (err) {
      console.error("❌ Error text_message_reply:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // ---------------- Delete Direct Message ----------------
  socket.on(
    "delete_direct_message",
    async ({ messageId, keycloakId }, callback) => {
      try {
        console.log("🗑️ delete_direct_message socket called:", {
          messageId,
          keycloakId,
        });

        // VALIDATION
        if (!messageId || !keycloakId) {
          return callback?.({
            status: "fail",
            message: "messageId and keycloakId are required",
          });
        }

        // TÌM USER THEO keycloakId
        const user = await User.findOne({ keycloakId });
        if (!user) {
          return callback?.({
            status: "fail",
            message: "User not found",
          });
        }

        // TÌM TRONG OneToOneMessage (direct messages)
        console.log("🔍 Searching for message in OneToOneMessage...");

        // Tìm conversation có chứa message này
        const conversation = await OneToOneMessage.findOne({
          "messages._id": messageId,
        });

        if (!conversation) {
          console.log("❌ Message not found in OneToOneMessage");
          return callback?.({
            status: "fail",
            message: "Message not found",
          });
        }

        // Tìm message cụ thể trong conversation
        const message = conversation.messages.id(messageId);
        if (!message) {
          return callback?.({
            status: "fail",
            message: "Message not found in conversation",
          });
        }

        console.log("✅ Found message:", {
          messageId: message._id,
          from: message.from,
          keycloakId: keycloakId,
          isOwner: message.from === keycloakId,
        });

        // BẢO MẬT: Kiểm tra user có phải là người gửi tin nhắn không
        if (message.from !== keycloakId) {
          console.log("🚫 Unauthorized delete attempt - Direct Message:", {
            attacker: keycloakId,
            messageOwner: message.from,
            messageId: messageId,
            timestamp: new Date(),
          });

          return callback?.({
            status: "fail",
            message: "You can only delete your own messages",
          });
        }

        // BẢO MẬT: Kiểm tra user có trong conversation không
        if (!conversation.participants.includes(keycloakId)) {
          console.log("🚫 User not in conversation:", {
            user: keycloakId,
            participants: conversation.participants,
          });

          return callback?.({
            status: "fail",
            message: "Access denied to this conversation",
          });
        }

        // XÓA TIN NHẮN TỪ OneToOneMessage
        await OneToOneMessage.updateOne(
          { _id: conversation._id },
          { $pull: { messages: { _id: messageId } } }
        );

        console.log("✅ Direct message deleted from OneToOneMessage:", {
          messageId,
          deletedBy: keycloakId,
          conversationId: conversation._id,
        });

        // TÌM SOCKET ID CỦA NGƯỜI CÒN LẠI
        const otherParticipant = conversation.participants.find(
          (participant) => participant !== keycloakId
        );

        console.log(
          "🔍 Finding socket for other participant:",
          otherParticipant
        );

        // Tìm socket ID của người còn lại
        let otherParticipantSocketId = null;
        const otherUser = await User.findOne({ keycloakId: otherParticipant });

        if (otherUser && otherUser.socketId) {
          otherParticipantSocketId = otherUser.socketId;
          console.log(
            `✅ Found socketId for ${otherParticipant}: ${otherParticipantSocketId}`
          );
        } else {
          console.log(
            `📭 Other participant ${otherParticipant} is offline or socketId not found`
          );
        }

        // EMIT SOCKET đến cả 2 users
        const socketData = {
          messageId: messageId,
          conversationId: conversation._id,
          deletedBy: keycloakId,
          isGroup: false,
          timestamp: new Date(),
        };

        // 1. Gửi cho người xóa (current user)
        socket.emit("message_deleted", socketData);

        // 2. Gửi cho người còn lại (nếu online)
        if (otherParticipantSocketId) {
          io.to(otherParticipantSocketId).emit("message_deleted", socketData);
          console.log(`📡 Emitted to other participant: ${otherParticipant}`);
        }

        console.log(
          "📡 Socket emitted for direct message deletion:",
          socketData
        );

        // Gửi kết quả thành công về client
        callback?.({
          status: "success",
          message: "Message deleted successfully",
          data: {
            messageId,
            conversationId: conversation._id,
            deletedAt: new Date(),
          },
        });
      } catch (err) {
        console.error("❌ Error in delete_direct_message:", err);
        callback?.({
          status: "error",
          message: "Internal server error",
        });
      }
    }
  );

  // ---------------- Typing Indicator ----------------
  socket.on("typing_start", ({ roomId }) => {
    if (roomId)
      socket.to(roomId).emit("typing_start", { userId: currentUserId });
  });

  socket.on("typing_stop", ({ roomId }) => {
    if (roomId)
      socket.to(roomId).emit("typing_stop", { userId: currentUserId });
  });

  // ---------------- Start Chat (Create or Get Conversation) ----------------
  socket.on("start_chat", async ({ to }, callback) => {
    try {
      if (!to) {
        return callback?.({ success: false, message: "Missing receiver id" });
      }

      const receiverId = to.toString();

      // Không cho chat với chính mình
      if (receiverId === currentUserId) {
        return callback?.({
          success: false,
          message: "Cannot chat with yourself",
        });
      }

      // Check tồn tại
      let conversation = await OneToOneMessage.findOne({
        participants: { $all: [currentUserId, receiverId] },
      });

      // Nếu chưa có → tạo mới
      if (!conversation) {
        conversation = await OneToOneMessage.create({
          participants: [currentUserId, receiverId],
          messages: [],
        });
      }

      // Populate participants info
      const users = await User.find({
        keycloakId: { $in: conversation.participants },
      }).select(
        "username email keycloakId avatar socketId status lastSeen e2eeEnabled"
      );

      const mapUsers = users.reduce((acc, user) => {
        acc[user.keycloakId] = {
          keycloakId: user.keycloakId,
          username: user.username,
          avatar: user.avatar,
          email: user.email,
          status: user.status || "Offline",
          lastSeen: user.lastSeen || null,
          e2eeEnabled: user.e2eeEnabled || false,
        };
        return acc;
      }, {});

      const responseData = {
        _id: conversation._id,
        participants: conversation.participants.map((uid) => mapUsers[uid]),
        messages: conversation.messages,
      };

      // Emit cho người gọi
      socket.emit("start_chat", responseData);

      // Emit cho người còn lại nếu online
      const receiverUser = users.find((u) => u.keycloakId === receiverId);
      if (receiverUser?.socketId) {
        io.to(receiverUser.socketId).emit("start_chat", responseData);
      }

      await AuditLog.create({
        user: currentUserId,
        action: "start_chat",
        targetId: receiverId,
      });

      callback?.({ success: true, conversation_id: conversation._id });
    } catch (err) {
      console.error("Error start_chat:", err);
      callback?.({ success: false, error: err.message });
    }
  });

  // ---------------- Friend Request ----------------
  socket.on("friend_request", async ({ to }) => {
    try {
      if (!to) return;

      const recipientId = to.toString();
      await FriendRequest.create({
        sender: currentUserId,
        recipient: recipientId,
      });

      const toUser = await User.findOne({ keycloakId: recipientId });
      const fromUser = await User.findOne({ keycloakId: currentUserId });

      // Notify user
      if (toUser?.socketId)
        io.to(toUser.socketId).emit("new_friend_request", { from: fromUser });

      if (fromUser?.socketId)
        io.to(fromUser.socketId).emit("request_sent", { to: toUser });

      await AuditLog.create({
        user: currentUserId,
        action: "friend_request_sent",
        targetId: recipientId,
      });
    } catch (err) {
      console.error("Error friend_request:", err);
    }
  });

  // ---------------- Accept Friend Request ----------------
  socket.on("accept_request", async ({ request_id, to }) => {
    try {
      console.log("🎉 Accepting friend request:", { request_id, to });

      // CÓ THỂ DÙNG to (keycloakId) HOẶC request_id
      let senderId;

      if (request_id) {
        // Tìm request theo ID
        const req = await FriendRequest.findById(request_id);
        if (!req) {
          console.log("❌ Friend request not found:", request_id);
          return;
        }
        senderId = req.sender;
      } else if (to) {
        // Dùng trực tiếp keycloakId
        senderId = to;
      } else {
        console.log("❌ Missing request_id or to parameter");
        return;
      }

      const sender = await User.findOne({ keycloakId: senderId });
      const receiver = await User.findOne({ keycloakId: currentUserId });

      if (!sender || !receiver) {
        console.log("❌ Sender or receiver not found");
        return;
      }

      // Add to friends list
      if (!sender.friends.includes(currentUserId)) {
        sender.friends.push(currentUserId);
      }
      if (!receiver.friends.includes(senderId)) {
        receiver.friends.push(senderId);
      }

      await Promise.all([sender.save(), receiver.save()]);

      // Emit request_accepted event
      const acceptedData = {
        from: currentUserId,
        to: senderId,
        message: "Friend request accepted",
        senderInfo: {
          keycloakId: receiver.keycloakId,
          username: receiver.username,
          avatar: receiver.avatar,
          e2eeEnabled: receiver.e2eeEnabled || false,
        },
        receiverInfo: {
          keycloakId: sender.keycloakId,
          username: sender.username,
          avatar: sender.avatar,
          e2eeEnabled: sender.e2eeEnabled || false,
        },
        timestamp: new Date(),
      };

      // Gửi cho cả 2 users
      console.log("📤 Emitting request_accepted events");

      // Gửi cho người accept
      socket.emit("request_accepted", acceptedData);

      // Gửi cho người gửi request
      if (sender?.socketId) {
        io.to(sender.socketId).emit("request_accepted", acceptedData);
        console.log(`✅ Sent to sender socket: ${sender.socketId}`);
      }

      // Cũng gửi qua keycloakId room
      io.to(senderId).emit("request_accepted", acceptedData);

      // Xóa friend request nếu có request_id
      if (request_id) {
        await FriendRequest.findByIdAndDelete(request_id);
      }

      await AuditLog.create({
        user: currentUserId,
        action: "friend_request_accepted",
        targetId: senderId,
        metadata: { senderId, receiverId: currentUserId },
      });

      console.log(
        `✅ Friend request accepted: ${currentUserId} <-> ${senderId}`
      );
    } catch (err) {
      console.error("❌ Error accept_request:", err);
    }
  });
};
