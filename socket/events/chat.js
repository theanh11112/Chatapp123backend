const User = require("../../models/user");
const OneToOneMessage = require("../../models/OneToOneMessage");
const FriendRequest = require("../../models/friendRequest");
const AuditLog = require("../../models/auditLog");
const { pushMessage } = require("../../models/OneToOneMessage.helper");
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

        // Tạo message object (không dùng ObjectId, chỉ dùng string UUID)
        const newMessage = {
          _id: id || undefined, // ⚡ id duy nhất, nếu client không gửi thì pushMessage tạo UUID
          from: currentUserId,
          to: toId,
          type: msgType,
          content: message,
          createdAt: new Date(),
          seen: false,
        };

        // ====================== Dùng pushMessage ======================
        const chat = await pushMessage([currentUserId, toId], newMessage);

        // 🔥 SỬA QUAN TRỌNG: Tạo message object đầy đủ để gửi realtime
        const messageForReceiver = {
          _id: newMessage._id, // Đảm bảo có _id
          id: newMessage._id, // Và cả id cho frontend
          from: currentUserId,
          to: toId, // ← QUAN TRỌNG: Đảm bảo có trường 'to'
          type: msgType,
          content: message,
          text: message, // ← Thêm trường text để tương thích
          createdAt: new Date(),
          seen: false,
          attachments: [], // ← Thêm trường attachments rỗng
        };

        const messageForSender = {
          ...messageForReceiver,
          // Có thể thêm các field đặc biệt cho sender nếu cần
        };

        // Gửi realtime cho người nhận
        const toUser = await User.findOne({ keycloakId: toId });

        if (toUser?.socketId) {
          io.to(toUser.socketId).emit("new_message", {
            conversation_id: chat._id,
            message: messageForReceiver, // ← DÙNG message đầy đủ
          });
        }

        // Gửi realtime cho sender

        socket.emit("new_message", {
          conversation_id: chat._id,
          message: messageForSender, // ← DÙNG message đầy đủ
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
