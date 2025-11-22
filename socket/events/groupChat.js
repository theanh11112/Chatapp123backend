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

  // Delete Group Message - THÊM PHẦN NÀY
  socket.on(
    "delete_group_message",
    async ({ messageId, keycloakId, roomId }, callback) => {
      try {
        console.log("🗑️ delete_group_message socket called:", {
          messageId,
          keycloakId,
          roomId,
        });

        // 🆕 VALIDATION
        if (!messageId || !keycloakId || !roomId) {
          return callback?.({
            status: "fail",
            message: "messageId, keycloakId and roomId are required",
          });
        }

        // 🆕 VALIDATION: Kiểm tra messageId format (ObjectId)
        if (!mongoose.Types.ObjectId.isValid(messageId)) {
          return callback?.({
            status: "fail",
            message: "Invalid message ID format",
          });
        }

        // 🆕 VALIDATION: Kiểm tra roomId format (ObjectId)
        if (!mongoose.Types.ObjectId.isValid(roomId)) {
          return callback?.({
            status: "fail",
            message: "Invalid room ID format",
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

        // 🆕 TÌM TRONG Message model (group messages)
        console.log("🔍 Searching for message in Message model (group)...");

        const message = await Message.findById(messageId);

        if (!message) {
          console.log("❌ Message not found in Message model");
          return callback?.({
            status: "fail",
            message: "Message not found",
          });
        }

        console.log("✅ Found group message:", {
          messageId: message._id,
          senderId: message.sender.id,
          keycloakId: keycloakId,
          isOwner: message.sender.id === keycloakId,
          roomId: message.room,
          roomIdFromClient: roomId,
        });

        // 🆕 BẢO MẬT: Kiểm tra user có phải là người gửi tin nhắn không
        if (message.sender.id !== keycloakId) {
          console.log("🚫 Unauthorized delete attempt - Group Message:", {
            attacker: keycloakId,
            messageOwner: message.sender.id,
            messageId: messageId,
            timestamp: new Date(),
          });

          return callback?.({
            status: "fail",
            message: "You can only delete your own messages",
          });
        }

        // 🆕 BẢO MẬT: Kiểm tra message có thuộc room này không
        if (message.room.toString() !== roomId) {
          console.log("🚫 Message does not belong to this room:", {
            messageRoom: message.room.toString(),
            requestedRoom: roomId,
          });

          return callback?.({
            status: "fail",
            message: "Message does not belong to this room",
          });
        }

        // Kiểm tra room có tồn tại và là group chat không
        const room = await Room.findById(roomId);
        if (!room) {
          return callback?.({
            status: "fail",
            message: "Group room not found",
          });
        }

        if (!room.isGroup) {
          return callback?.({
            status: "fail",
            message:
              "This is a direct conversation, use direct delete endpoint",
          });
        }

        // 🆕 BẢO MẬT: Kiểm tra user có trong group không
        if (!room.members.includes(keycloakId)) {
          console.log("🚫 User not in group:", {
            user: keycloakId,
            groupMembers: room.members,
          });

          return callback?.({
            status: "fail",
            message: "Access denied to this group",
          });
        }

        // 🆕 BẢO MẬT: Kiểm tra thời gian xóa (chỉ cho phép xóa trong 1 giờ) - GIỮ NGUYÊN
        const messageAge = Date.now() - new Date(message.createdAt).getTime();
        const oneHour = 60 * 60 * 1000; // 1 giờ

        console.log("⏰ Message age check:", {
          messageCreatedAt: message.createdAt,
          messageAgeInMinutes: (messageAge / (60 * 1000)).toFixed(2),
          messageAgeInHours: (messageAge / (60 * 60 * 1000)).toFixed(2),
          allowedAgeInHours: 1,
        });

        if (messageAge > oneHour) {
          console.log("⏰ Message is too old to delete:", {
            messageId,
            messageAgeInHours: (messageAge / (60 * 60 * 1000)).toFixed(2),
            allowedAgeInHours: 1,
          });

          return callback?.({
            status: "fail",
            message: "You can only delete messages within 1 hour of sending", // GIỮ NGUYÊN 1 GIỜ
          });
        }

        // 🗑️ XÓA TIN NHẮN TỪ DATABASE
        await Message.findByIdAndDelete(messageId);

        console.log("✅ Group message deleted from DB:", {
          messageId,
          deletedBy: keycloakId,
          roomId: room._id,
          roomName: room.name,
        });

        // 📡 EMIT SOCKET để thông báo cho tất cả members trong group
        const socketData = {
          messageId: messageId,
          roomId: room._id,
          deletedBy: keycloakId,
          isGroup: true,
          timestamp: new Date(),
        };

        // SỬA LỖI: Dùng io.to() thay vì io.server.to()
        io.to(roomId.toString()).emit("message_deleted", socketData);

        console.log(
          "📡 Socket emitted for group message deletion to room:",
          roomId.toString(),
          socketData
        );

        // Gửi kết quả thành công về client
        callback?.({
          status: "success",
          message: "Message deleted successfully",
          data: {
            messageId,
            roomId: room._id,
            roomName: room.name,
            deletedAt: new Date(),
          },
        });
      } catch (err) {
        console.error("❌ Error in delete_group_message:", err);
        callback?.({
          status: "error",
          message: "Internal server error",
        });
      }
    }
  );

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
