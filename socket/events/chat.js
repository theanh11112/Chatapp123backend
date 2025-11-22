const User = require("../../models/user");
const OneToOneMessage = require("../../models/OneToOneMessage");
const FriendRequest = require("../../models/friendRequest");
const AuditLog = require("../../models/auditLog");
const { pushMessage } = require("../../models/OneToOneMessage.helper");
const { v4: uuidv4 } = require("uuid");
module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;
  if (!currentUserId)
    return console.warn("Socket connected without user info!");

  const ALLOWED_MSG_TYPES = ["text", "image", "file", "video", "system"];

  console.log(
    "⚙️ Chat events loaded for user:",
    socket.user.username,
    currentUserId
  );

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
      }).select("username email keycloakId avatar socketId status lastSeen");

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
          _id: id || undefined,
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

        // 🆕 SỬA QUAN TRỌNG: Tạo message object đầy đủ với đúng structure
        const messageData = {
          _id: newMessage._id,
          id: newMessage._id,
          message: message,
          content: message,
          type: "msg",
          subtype: msgType,
          from: currentUserId,
          to: toId,
          conversation_id: chat._id.toString(), // 🆕 THÊM conversation_id
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          createdAt: new Date(),
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

        // 🆕 SỬA: Gửi event "text_message" thay vì "new_message"
        const toUser = await User.findOne({ keycloakId: toId });

        if (toUser?.socketId) {
          console.log("🚀 Emitting text_message to receiver:", toUser.socketId);
          io.to(toUser.socketId).emit("text_message", messageData);
        }

        // Gửi lại cho sender để confirm
        console.log("🚀 Emitting text_message to sender:", socket.id);
        socket.emit("text_message", {
          ...messageData,
          incoming: false,
          outgoing: true,
        });

        // 🆕 THÊM: Gửi cả event "new_message" để tương thích ngược (nếu cần)
        if (toUser?.socketId) {
          io.to(toUser.socketId).emit("new_message", {
            conversation_id: chat._id,
            message: messageData,
          });
        }
        socket.emit("new_message", {
          conversation_id: chat._id,
          message: messageData,
        });

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

  // server/sockets/directChat.js - THÊM PHẦN NÀY
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

      // 🆕 SỬA: Tạo message data đầy đủ với đúng structure
      const messageData = {
        _id: newMessage._id,
        id: newMessage._id.toString(),
        message: message,
        content: message,
        type: "msg",
        subtype: "reply",
        from: from,
        to: to,
        conversation_id: conversation_id, // 🆕 THÊM conversation_id
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

      // 🆕 SỬA: Gửi event "text_message_reply" và "text_message"
      const toUser = await User.findOne({ keycloakId: to });

      // Gửi event chính cho cả sender và receiver
      io.to(toUser.socketId).emit("text_message_reply", messageData);

      console.log(
        "✅ Direct reply message sent successfully via multiple events"
      );

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

        // 🆕 VALIDATION
        if (!messageId || !keycloakId) {
          return callback?.({
            status: "fail",
            message: "messageId and keycloakId are required",
          });
        }

        // 🆕 TÌM USER THEO keycloakId
        const user = await User.findOne({ keycloakId });
        if (!user) {
          return callback?.({
            status: "fail",
            message: "User not found",
          });
        }

        // 🆕 QUAN TRỌNG: TÌM TRONG OneToOneMessage (direct messages)
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

        // 🆕 BẢO MẬT: Kiểm tra user có phải là người gửi tin nhắn không
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

        // 🆕 BẢO MẬT: Kiểm tra user có trong conversation không
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

        // 🗑️ XÓA TIN NHẮN TỪ OneToOneMessage
        await OneToOneMessage.updateOne(
          { _id: conversation._id },
          { $pull: { messages: { _id: messageId } } }
        );

        console.log("✅ Direct message deleted from OneToOneMessage:", {
          messageId,
          deletedBy: keycloakId,
          conversationId: conversation._id,
        });

        // 📡 TÌM SOCKET ID CỦA NGƯỜI CÒN LẠI TRONG CONVERSATION
        const otherParticipant = conversation.participants.find(
          (participant) => participant !== keycloakId
        );

        console.log(
          "🔍 Finding socket for other participant:",
          otherParticipant
        );

        // Tìm socket ID của người còn lại từ database
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

        // 📡 EMIT SOCKET đến cả 2 users
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
      }).select("username email keycloakId avatar socketId status lastSeen");

      const mapUsers = users.reduce((acc, user) => {
        acc[user.keycloakId] = {
          keycloakId: user.keycloakId,
          username: user.username,
          avatar: user.avatar,
          email: user.email,
          status: user.status || "Offline",
          lastSeen: user.lastSeen || null,
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
  socket.on("accept_request", async ({ request_id }) => {
    try {
      if (!request_id) return;

      const req = await FriendRequest.findById(request_id);
      if (!req) return;

      const sender = await User.findOne({ keycloakId: req.sender });
      const receiver = await User.findOne({ keycloakId: req.recipient });

      if (!sender || !receiver) return;

      sender.friends.push(receiver.keycloakId);
      receiver.friends.push(sender.keycloakId);

      await sender.save();
      await receiver.save();
      await FriendRequest.findByIdAndDelete(request_id);

      if (sender?.socketId)
        io.to(sender.socketId).emit("request_accepted", { user: receiver });

      if (receiver?.socketId)
        io.to(receiver.socketId).emit("request_accepted", { user: sender });

      await AuditLog.create({
        user: receiver.keycloakId,
        action: "friend_request_accepted",
        targetId: sender.keycloakId,
      });
    } catch (err) {
      console.error("Error accept_request:", err);
    }
  });
};
