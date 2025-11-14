const User = require("../../models/user");
const OneToOneMessage = require("../../models/OneToOneMessage");
const FriendRequest = require("../../models/friendRequest");
const AuditLog = require("../../models/auditLog");

module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;
  if (!currentUserId) return console.warn("Socket connected without user info!");

  const ALLOWED_MSG_TYPES = ["text", "image", "file", "video", "system"];
  console.log("⚙️ Chat events loaded for user:", socket.user.username, currentUserId);

  // ---------------- Get Direct Conversations ----------------
  socket.on("get_direct_conversations", async ({ keycloakId }, callback) => {
    try {
      const conversations = await OneToOneMessage.find({
        participants: { $in: [keycloakId] },
      }).populate("participants", "username email keycloakId");

      callback(conversations);
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
  socket.on("text_message", async ({ conversation_id, to, message, type }, callback) => {
    try {
      if (!to || !message) return callback?.({ success: false, error: "Missing required fields" });

      const toId = to.toString();
      const msgType = type && ALLOWED_MSG_TYPES.includes(type.trim().toLowerCase())
        ? type.trim().toLowerCase()
        : "text";

      const newMessage = {
        from: currentUserId,
        to: toId,
        type: msgType,
        content: message,
        createdAt: new Date(),
        seen: false,
      };

      // Tìm hoặc tạo conversation
      let chat = conversation_id
        ? await OneToOneMessage.findById(conversation_id)
        : await OneToOneMessage.findOne({ participants: { $all: [currentUserId, toId] } });

      if (!chat) {
        chat = await OneToOneMessage.create({ participants: [currentUserId, toId], messages: [] });
      }

      chat.messages.push(newMessage);
      await chat.save();

      const toUser = await User.findOne({ keycloakId: toId });

      if (toUser?.socketId) {
        io.to(toUser.socketId).emit("new_message", { conversation_id: chat._id, message: newMessage });
      }

      socket.emit("new_message", { conversation_id: chat._id, message: newMessage });

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
  });

  // ---------------- Typing Indicator ----------------
  socket.on("typing_start", ({ roomId }) => roomId && socket.to(roomId).emit("typing_start", { userId: currentUserId }));
  socket.on("typing_stop", ({ roomId }) => roomId && socket.to(roomId).emit("typing_stop", { userId: currentUserId }));

  // ---------------- Friend Request ----------------
  socket.on("friend_request", async ({ to }) => {
    try {
      if (!to) return;
      const recipientId = to.toString();
      await FriendRequest.create({ sender: currentUserId, recipient: recipientId });

      const toUser = await User.findOne({ keycloakId: recipientId });
      const fromUser = await User.findOne({ keycloakId: currentUserId });

      if (toUser?.socketId) io.to(toUser.socketId).emit("new_friend_request", { from: fromUser });
      if (fromUser?.socketId) io.to(fromUser.socketId).emit("request_sent", { to: toUser });

      await AuditLog.create({ user: currentUserId, action: "friend_request_sent", targetId: recipientId });
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

      if (sender?.socketId) io.to(sender.socketId).emit("request_accepted", { user: receiver });
      if (receiver?.socketId) io.to(receiver.socketId).emit("request_accepted", { user: sender });

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
