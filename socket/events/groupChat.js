// server/sockets/groupChat.js
const Room = require("../../models/room");
const User = require("../../models/user");
const AuditLog = require("../../models/auditLog");
const mongoose = require("mongoose");
const Message = require("../../models/message");

module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;
  if (!currentUserId) return;

  // ---------------- Get Group Rooms ----------------
  socket.on("get_group_rooms", async ({ keycloakId }, callback) => {
    try {
      console.log("🔍 Fetching group rooms for user:", keycloakId);
      const keycloakIdObj = mongoose.Types.ObjectId(keycloakId);

      // Tìm các room mà user là thành viên
      const rooms = await Room.find({
        "members.keycloakId": keycloakIdObj,
        isActive: true,
      })
        .populate("createdBy", "username keycloakId avatar")
        .populate("members.user", "username keycloakId avatar status lastSeen")
        .sort({ updatedAt: -1 });

      console.log(
        `✅ Found ${rooms.length} group rooms for user ${keycloakId}`
      );

      callback(rooms);
    } catch (err) {
      console.error("❌ Error get_group_rooms:", err);
      callback([]);
    }
  });

  // ---------------- Get Group Messages ----------------
  socket.on("get_group_messages", async ({ roomId }, callback) => {
    try {
      console.log("📨 Fetching messages for room:", roomId);
      const roomIdObj = mongoose.Types.ObjectId(roomId);

      if (!roomId) {
        return callback?.([]);
      }

      const room = await Room.findById(roomIdObj).populate(
        "messages.sender",
        "username keycloakId avatar"
      );

      if (!room) {
        console.log("❌ Room not found:", roomId);
        return callback?.([]);
      }

      // Sắp xếp messages theo thời gian (cũ → mới)
      const sortedMessages = room.messages.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );

      console.log(
        `✅ Found ${sortedMessages.length} messages in room ${roomId}`
      );

      callback(sortedMessages);
    } catch (err) {
      console.error("❌ Error get_group_messages:", err);
      callback([]);
    }
  });

  // 🆕 QUAN TRỌNG: Handle Group Message - THÊM VÀO ĐÂY

  socket.on("group_message", async (data, callback) => {
    try {
      console.log("📨 Received group_message:", data.sender);

      const {
        roomId,
        message,
        type = "text",
        messageId,
        timestamp,
        sender,
      } = data;
      const roomIdObj = new mongoose.Types.ObjectId(roomId);

      // Validate required fields
      if (!roomIdObj || !message) {
        console.log("❌ Missing required fields:", { roomId, message });
        return callback?.({
          success: false,
          error: "Missing roomId or message",
        });
      }

      // Kiểm tra room tồn tại và user có trong room không
      const room = await Room.findOne({
        _id: roomIdObj,
        members: sender.keycloakId,
      });

      if (!room) {
        console.log("❌ Room not found or user not in room:", roomIdObj);
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // 🆕 Tạo message trong Message collection
      const newMessage = await Message.create({
        room: roomIdObj,
        content: message,
        type: type,
        sender: {
          // 🆕 SỬA: TRUYỀN OBJECT
          id: sender.keycloakId,
          name: sender.username,
        },
      });

      // 🆕 Cập nhật lastMessage cho room
      await Room.findByIdAndUpdate(roomIdObj, {
        lastMessage: newMessage._id,
        updatedAt: new Date(),
      });

      console.log("✅ Message saved to DB:", newMessage._id);

      // 🆕 Chuẩn bị message data để gửi realtime
      const messageForClients = {
        _id: newMessage._id,
        id: newMessage._id.toString(),
        content: newMessage.content,
        type: newMessage.type,
        sender: {
          keycloakId: sender.keycloakId,
          username: sender.username,
        },
        room: roomId,
        createdAt: newMessage.createdAt,
        updatedAt: newMessage.updatedAt,
      };

      console.log("📤 Broadcasting to room:", roomId, messageForClients);

      // 🆕 Broadcast message đến tất cả thành viên trong room
      io.to(roomId).emit("new_group_message", {
        roomId: roomId,
        message: messageForClients,
      });

      console.log("✅ Message sent and broadcasted successfully");

      // 🆕 Response success
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

  // server/sockets/groupChat.js - THÊM PHẦN NÀY
  socket.on("group_message_reply", async (data, callback) => {
    try {
      console.log("📨 Received group_message_reply:", data);

      const {
        roomId,
        message,
        type = "reply",
        messageId,
        timestamp,
        sender,
        replyTo,
        replyContent,
        replySender,
      } = data;

      const roomIdObj = new mongoose.Types.ObjectId(roomId);

      // Validate required fields
      if (!roomIdObj || !message || !replyTo) {
        console.log("❌ Missing required fields for reply:", {
          roomId,
          message,
          replyTo,
        });
        return callback?.({
          success: false,
          error: "Missing roomId, message or replyTo",
        });
      }

      // Kiểm tra room tồn tại và user có trong room không
      const room = await Room.findOne({
        _id: roomIdObj,
        members: sender.keycloakId,
      });

      if (!room) {
        console.log("❌ Room not found or user not in room:", roomIdObj);
        return callback?.({
          success: false,
          error: "Room not found or access denied",
        });
      }

      // 🆕 SỬA: Tạo sender object đầy đủ theo schema requirements
      const senderData = {
        id: sender.keycloakId, // 🆕 THÊM: id bắt buộc
        name: sender.username, // 🆕 THÊM: name bắt buộc
        keycloakId: sender.keycloakId,
        username: sender.username,
        avatar: sender.avatar || null,
      };

      // 🆕 Tạo reply message trong Message collection
      const newMessage = await Message.create({
        room: roomIdObj,
        content: message,
        type: "reply",
        sender: senderData, // 🆕 SỬA: Dùng senderData đầy đủ
        replyTo: replyTo,
        replyContent: replyContent,
        replySender: replySender,
      });

      // 🆕 Cập nhật lastMessage cho room
      await Room.findByIdAndUpdate(roomIdObj, {
        lastMessage: newMessage._id,
        updatedAt: new Date(),
      });

      console.log("✅ Reply message saved to DB:", newMessage._id);

      // 🆕 Populate thông tin reply
      const populatedMessage = await Message.findById(newMessage._id)
        .populate("replyTo", "content sender type")
        .exec();

      // 🆕 Chuẩn bị message data để gửi realtime
      const messageForClients = {
        _id: newMessage._id,
        id: newMessage._id.toString(),
        content: newMessage.content,
        type: newMessage.type,
        sender: {
          id: sender.keycloakId, // 🆕 THÊM: id
          name: sender.username, // 🆕 THÊM: name
          keycloakId: sender.keycloakId,
          username: sender.username,
          avatar: sender.avatar || null,
        },
        room: roomId,
        replyTo: {
          id: replyTo,
          content: replyContent,
          sender: replySender,
          type: "text",
        },
        createdAt: newMessage.createdAt,
        updatedAt: newMessage.updatedAt,
      };

      console.log("📤 Broadcasting reply to room:", roomId, messageForClients);

      // 🆕 Broadcast reply message đến tất cả thành viên trong room
      io.to(roomId).emit("new_group_message", {
        roomId: roomId,
        message: messageForClients,
      });

      console.log("✅ Reply message sent and broadcasted successfully");

      // 🆕 Response success
      callback?.({
        success: true,
        message: "Reply message sent successfully",
        data: messageForClients,
      });
    } catch (err) {
      console.error("❌ Error group_message_reply:", err);
      callback?.({
        success: false,
        error: err.message,
      });
    }
  });

  // ---------------- Join Group Room ----------------
  socket.on("join_group_room", async ({ roomId }) => {
    try {
      console.log("🔗 User joining group room:", {
        userId: currentUserId,
        roomId,
      });

      if (!roomId) return;
      const roomIdObj = mongoose.Types.ObjectId(roomId);

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

      console.log(`✅ User ${currentUserId} joined room ${roomId}`);

      // Thông báo user online (tuỳ chọn)
      socket.to(roomId).emit("user_joined_room", {
        roomId,
        user: {
          keycloakId: currentUserId,
          username: socket.user.username,
          avatar: socket.user.avatar,
        },
      });
    } catch (err) {
      console.error("❌ Error join_group_room:", err);
    }
  });

  // ---------------- Leave Group Room ----------------
  socket.on("leave_group_room", ({ roomId }) => {
    try {
      console.log("🚪 User leaving group room:", {
        userId: currentUserId,
        roomId,
      });

      if (!roomId) return;

      socket.leave(roomId);

      // Thông báo user left (tuỳ chọn)
      socket.to(roomId).emit("user_left_room", {
        roomId,
        user: {
          keycloakId: currentUserId,
          username: socket.user.username,
        },
      });
    } catch (err) {
      console.error("❌ Error leave_group_room:", err);
    }
  });

  // ---------------- Typing in Group ----------------
  socket.on("group_typing_start", ({ roomId }) => {
    if (roomId) {
      socket.to(roomId).emit("group_typing_start", {
        roomId,
        user: {
          keycloakId: currentUserId,
          username: socket.user.username,
        },
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
        },
      });
    }
  });
};
