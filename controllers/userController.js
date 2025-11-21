// controllers/userController.js
const Room = require("../models/room");
const User = require("../models/user");
const Message = require("../models/message");
const Call = require("../models/call");
const catchAsync = require("../utils/catchAsync");
const filterObj = require("../utils/filterObj");
const mongoose = require("mongoose");

/*
|--------------------------------------------------------------------------
| USER PROFILE
|--------------------------------------------------------------------------
*/

// GET /users/me
exports.getMe = catchAsync(async (req, res) => {
  const keycloakId = req.user?.keycloakId || req.user?.id;

  if (!keycloakId)
    return res
      .status(400)
      .json({ status: "fail", message: "Missing user token" });

  const user = await User.findOne({ keycloakId });

  if (!user)
    return res.status(404).json({ status: "fail", message: "User not found" });

  res.status(200).json({ status: "success", data: user });
});

exports.getProfile = exports.getMe;

// PATCH /users/me
exports.updateMe = catchAsync(async (req, res) => {
  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "about",
    "avatar"
  );

  const updatedUser = await User.findByIdAndUpdate(req.user._id, filteredBody, {
    new: true,
  });

  res.status(200).json({
    status: "success",
    message: "Profile updated successfully",
    data: updatedUser,
  });
});

exports.updateProfile = exports.updateMe;

/*
|--------------------------------------------------------------------------
| ROOM HELPERS
|--------------------------------------------------------------------------
*/

const getUserFromToken = async (req) => {
  const keycloakId = req.user?.keycloakId;
  if (!keycloakId) return null;
  return await User.findOne({ keycloakId });
};

/*
|--------------------------------------------------------------------------
| DIRECT CHAT
|--------------------------------------------------------------------------
*/

// POST /users/direct/get-one
exports.getDirectConversationById = catchAsync(async (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ message: "roomId is required" });

  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const room = await Room.findOne({
    _id: roomId,
    isGroup: false,
    members: user._id,
  })
    .populate(
      "members",
      "keycloakId username firstName lastName avatar status lastSeen"
    )
    .populate("createdBy", "keycloakId username avatar")
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: "keycloakId username avatar" },
    });

  if (!room) return res.status(404).json({ message: "Conversation not found" });

  res.status(200).json({ status: "success", data: room });
});

// POST /users/direct/get-all
exports.getDirectConversations = catchAsync(async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const rooms = await Room.find({ isGroup: false, members: user._id })
    .populate(
      "members",
      "keycloakId username firstName lastName avatar status lastSeen"
    )
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: "keycloakId username avatar" },
    })
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json({ status: "success", results: rooms.length, data: rooms });
});

/*
|--------------------------------------------------------------------------
| GROUP CHAT
|--------------------------------------------------------------------------
*/

// POST /users/group/get-one
exports.getGroupRooms = catchAsync(async (req, res) => {
  const { keycloakId } = req.body;

  console.log("🔍 Received keycloakId:", keycloakId);

  if (!keycloakId) {
    return res.status(400).json({ message: "keycloakId is required" });
  }

  // 🆕 SỬA: Tìm rooms có chứa keycloakId trong mảng members
  const rooms = await Room.find({
    isGroup: true,
    members: keycloakId, // 🆕 Tìm rooms có member là keycloakId này
  })
    .populate("lastMessage")
    .populate("pinnedMessages")
    .sort({ updatedAt: -1 });

  console.log(`✅ Found ${rooms.length} group rooms for user ${keycloakId}`);

  // 🆕 THÊM: Lấy thông tin chi tiết của members và createdBy
  const roomsWithUserDetails = await Promise.all(
    rooms.map(async (room) => {
      // Lấy thông tin chi tiết của tất cả members
      const memberDetails = await User.find({
        keycloakId: { $in: room.members },
      }).select(
        "keycloakId username firstName lastName avatar status lastSeen"
      );

      // Lấy thông tin người tạo room
      const createdByUser = await User.findOne({
        keycloakId: room.createdBy,
      }).select("keycloakId username firstName lastName avatar");

      return {
        _id: room._id,
        name: room.name,
        isGroup: room.isGroup,
        members: memberDetails,
        createdBy: createdByUser,
        lastMessage: room.lastMessage,
        pinnedMessages: room.pinnedMessages,
        topic: room.topic,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      };
    })
  );

  res.status(200).json({
    status: "success",
    results: roomsWithUserDetails.length,
    data: roomsWithUserDetails,
  });
});

// POST /users/group/get-all
// exports.getGroupRooms = catchAsync(async (req, res) => {
//   const user = await getUserFromToken(req);
//   if (!user) return res.status(404).json({ message: "User not found" });

//   const rooms = await Room.find({ isGroup: true, members: user._id })
//     .populate(
//       "members",
//       "keycloakId username firstName lastName avatar status lastSeen"
//     )
//     .populate("createdBy", "keycloakId username avatar")
//     .populate({
//       path: "lastMessage",
//       populate: { path: "sender", select: "keycloakId username avatar" },
//     })
//     .sort({ updatedAt: -1 });

//   res
//     .status(200)
//     .json({ status: "success", results: rooms.length, data: rooms });
// });

/*
|--------------------------------------------------------------------------
| ROOM MESSAGES
|--------------------------------------------------------------------------
*/

// POST /users/room/messages
exports.getRoomMessages = catchAsync(async (req, res) => {
  const { roomId, page = 1, limit = 50 } = req.body;
  if (!roomId) return res.status(400).json({ message: "roomId is required" });

  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  const room = await Room.findOne({
    _id: roomObjectId,
    members: user.keycloakId,
  });
  if (!room) return res.status(403).json({ message: "Access denied" });

  const skip = (page - 1) * limit;

  // 🆕 SỬA QUAN TRỌNG: Populate replyTo với thông tin đầy đủ
  let messages = await Message.find({ room: roomObjectId })
    .populate("sender", "keycloakId username firstName lastName avatar")
    .populate({
      path: "replyTo",
      select: "content sender type createdAt",
      populate: {
        path: "sender",
        select: "keycloakId username firstName lastName avatar",
      },
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  console.log("🔍 Messages found:", messages.length);

  // 🆕 THÊM: Log để debug replyTo

  messages = messages.reverse();

  // 🆕 SỬA: Transform messages để có structure giống socket
  const transformedMessages = messages.map((msg) => {
    const messageObj = msg.toObject ? msg.toObject() : { ...msg };

    // 🆕 XỬ LÝ REPLYTO - TẠO OBJECT ĐẦY ĐỦ
    let processedReplyTo = null;
    if (messageObj.replyTo) {
      if (typeof messageObj.replyTo === "object" && messageObj.replyTo._id) {
        // Đã populate replyTo - tạo object đầy đủ
        processedReplyTo = {
          id: messageObj.replyTo._id,
          content:
            messageObj.replyTo.content ||
            messageObj.replyContent ||
            "Original message",
          sender: messageObj.replyTo.sender ||
            messageObj.replySender || {
              keycloakId: "unknown",
              username: "Unknown",
            },
          type: messageObj.replyTo.type || messageObj.replyType || "text",
        };
      } else if (typeof messageObj.replyTo === "string") {
        // Chỉ có ID - tạo object với thông tin có sẵn
        processedReplyTo = {
          id: messageObj.replyTo,
          content: messageObj.replyContent || "Original message",
          sender: messageObj.replySender || {
            keycloakId: "unknown",
            username: "Unknown",
          },
          type: messageObj.replyType || "text",
        };
      }
    }

    // 🆕 TẠO MESSAGE STRUCTURE ĐỒNG NHẤT VỚI SOCKET
    return {
      _id: messageObj._id,
      id: messageObj._id.toString(),
      type: "msg",
      subtype: messageObj.type || "text",
      message: messageObj.content || "",
      content: messageObj.content || "",
      incoming: messageObj.sender?.keycloakId !== user.keycloakId,
      outgoing: messageObj.sender?.keycloakId === user.keycloakId,
      time: formatMessageTime(messageObj.createdAt),
      createdAt: messageObj.createdAt,
      attachments: messageObj.attachments || [],
      sender: messageObj.sender || {
        keycloakId: "unknown",
        username: "Unknown",
      },
      // 🆕 THÊM REPLYTO ĐÃ XỬ LÝ
      replyTo: processedReplyTo,
      replyContent: messageObj.replyContent,
      replySender: messageObj.replySender,
      replyType: messageObj.replyType,
    };
  });

  console.log("✅ Transformed messages for API:", {
    total: transformedMessages.length,
    with_reply: transformedMessages.filter((m) => m.replyTo).length,
  });

  res.status(200).json({
    status: "success",
    results: transformedMessages.length,
    pagination: { page, limit },
    data: transformedMessages,
  });
});

// 🆕 THÊM: Hàm format message time
const formatMessageTime = (timestamp) => {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (error) {
    console.error("Error formatting time:", error);
    return "";
  }
};

/*
|--------------------------------------------------------------------------
| CREATE ROOM
|--------------------------------------------------------------------------
*/

// POST /users/room/create
exports.createRoom = catchAsync(async (req, res) => {
  const { name, memberKeycloakIds, isGroup = false, topic } = req.body;

  const members = await User.find({
    keycloakId: { $in: memberKeycloakIds },
  }).select("_id");

  const newRoom = await Room.create({
    name: isGroup ? name : null,
    isGroup,
    members,
    createdBy: req.user._id,
    topic: topic || null,
  });

  res.status(201).json({ status: "success", data: newRoom });
});

exports.createPrivateRoom = exports.createRoom;

/*
|--------------------------------------------------------------------------
| SEND MESSAGE
|--------------------------------------------------------------------------
*/

// POST /users/message/send
exports.sendMessage = catchAsync(async (req, res) => {
  const { roomId, content, type = "text", replyTo } = req.body;

  console.log("📨 Sending message:", { roomId, content, type, replyTo });

  const user = await getUserFromToken(req);
  if (!user) return res.status(403).json({ message: "Invalid token user" });

  // Kiểm tra room tồn tại và user có quyền truy cập
  const room = await Room.findOne({ _id: roomId, members: user._id });
  if (!room) return res.status(403).json({ message: "Access denied" });

  // Tạo message mới
  const message = await Message.create({
    sender: user._id,
    room: roomId,
    content,
    type,
    replyTo: replyTo || null,
  });

  console.log("✅ Message created:", message._id);

  // Cập nhật lastMessage cho room
  await Room.findByIdAndUpdate(roomId, {
    lastMessage: message._id,
    updatedAt: new Date(),
  });

  // Populate sender info để trả về frontend
  const populatedMessage = await Message.findById(message._id)
    .populate("sender", "keycloakId username firstName lastName avatar")
    .populate("replyTo");

  console.log("✅ Populated message:", populatedMessage);

  res.status(200).json({
    status: "success",
    data: populatedMessage,
  });
});

/*
|--------------------------------------------------------------------------
| FRIENDS
|--------------------------------------------------------------------------
*/

exports.getFriends = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate(
    "friends",
    "firstName lastName username email avatar"
  );

  res.status(200).json({ status: "success", data: user.friends });
});

/*
|--------------------------------------------------------------------------
| CALL MANAGEMENT
|--------------------------------------------------------------------------
*/

exports.createCall = catchAsync(async (req, res) => {
  const { type, roomId, participants } = req.body;

  if (!["audio", "video"].includes(type))
    return res.status(400).json({ message: "Invalid call type" });

  const call = await Call.create({ type, room: roomId, participants });

  res.status(201).json({ status: "success", data: call });
});

exports.endCall = catchAsync(async (req, res) => {
  const { callId } = req.body;

  const call = await Call.findByIdAndUpdate(
    callId,
    { status: "Ended", endedAt: new Date() },
    { new: true }
  );

  if (!call) return res.status(404).json({ message: "Call not found" });

  res.status(200).json({ status: "success", data: call });
});

exports.getCallHistory = catchAsync(async (req, res) => {
  const calls = await Call.find({ participants: req.user._id })
    .populate("participants", "firstName lastName username avatar")
    .populate("room", "name");

  res.status(200).json({ status: "success", data: calls });
});

/*
|--------------------------------------------------------------------------
| GET ALL ROOMS FOR USER (DIRECT + GROUP)
|--------------------------------------------------------------------------
*/

exports.getUserRooms = catchAsync(async (req, res) => {
  const user = await getUserFromToken(req);
  if (!user) return res.status(404).json({ message: "User not found" });

  const rooms = await Room.find({ members: user._id })
    .populate(
      "members",
      "keycloakId username firstName lastName avatar status lastSeen"
    )
    .populate("createdBy", "keycloakId username avatar")
    .populate({
      path: "lastMessage",
      populate: { path: "sender", select: "keycloakId username avatar" },
    })
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json({ status: "success", results: rooms.length, data: rooms });
});

/// 🆕 THÊM: Xóa tin nhắn direct (one-to-one) - HOÀN CHỈNH
exports.deleteDirectMessage = catchAsync(async (req, res) => {
  const { messageId } = req.body;

  console.log("🗑️ deleteDirectMessage called:", { messageId });

  // 🆕 VALIDATION: Kiểm tra messageId
  if (!messageId) {
    return res.status(400).json({
      status: "fail",
      message: "messageId is required in request body",
    });
  }

  // 🆕 VALIDATION: Kiểm tra messageId format
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid message ID format",
    });
  }

  // Lấy thông tin user từ token
  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({
      status: "fail",
      message: "User not found or unauthorized",
    });
  }

  // Tìm tin nhắn và kiểm tra quyền
  const message = await Message.findById(messageId)
    .populate("sender", "keycloakId username")
    .populate("room");

  if (!message) {
    return res.status(404).json({
      status: "fail",
      message: "Message not found",
    });
  }

  // 🆕 BẢO MẬT: Kiểm tra user có phải là người gửi tin nhắn không
  if (message.sender.keycloakId !== user.keycloakId) {
    console.log("🚫 Unauthorized delete attempt - Direct Message:", {
      attacker: user.keycloakId,
      messageOwner: message.sender.keycloakId,
      messageId: messageId,
      timestamp: new Date(),
    });

    return res.status(403).json({
      status: "fail",
      message: "You can only delete your own messages",
    });
  }

  // Kiểm tra room có tồn tại và là direct chat không
  const room = await Room.findById(message.room._id);
  if (!room) {
    return res.status(404).json({
      status: "fail",
      message: "Conversation not found",
    });
  }

  if (room.isGroup) {
    return res.status(400).json({
      status: "fail",
      message: "This is a group conversation, use group delete endpoint",
    });
  }

  // 🆕 BẢO MẬT: Kiểm tra user có trong conversation không
  if (!room.members.includes(user.keycloakId)) {
    console.log("🚫 User not in conversation:", {
      user: user.keycloakId,
      conversationMembers: room.members,
    });

    return res.status(403).json({
      status: "fail",
      message: "Access denied to this conversation",
    });
  }

  // 🆕 BẢO MẬT: Kiểm tra thời gian xóa (chỉ cho phép xóa trong 1 giờ)
  const messageAge = Date.now() - new Date(message.createdAt).getTime();
  const oneHour = 60 * 60 * 1000;

  if (messageAge > oneHour) {
    return res.status(403).json({
      status: "fail",
      message: "You can only delete messages within 1 hour of sending",
    });
  }

  // 🗑️ XÓA TIN NHẮN TỪ DATABASE
  await Message.findByIdAndDelete(messageId);

  console.log("✅ Direct message deleted from DB:", {
    messageId,
    deletedBy: user.keycloakId,
    conversationId: room._id,
  });

  // 📡 EMIT SOCKET để thông báo cho cả 2 users trong conversation
  if (req.io) {
    const socketData = {
      messageId: messageId,
      conversationId: room._id,
      deletedBy: user.keycloakId,
      isGroup: false,
      timestamp: new Date(),
    };

    req.io.to(room._id.toString()).emit("message_deleted", socketData);

    console.log("📡 Socket emitted for direct message deletion:", socketData);
  }

  res.status(200).json({
    status: "success",
    message: "Message deleted successfully",
    data: {
      messageId,
      conversationId: room._id,
      deletedAt: new Date(),
    },
  });
});

// 🆕 THÊM: Xóa tin nhắn group - HOÀN CHỈNH
exports.deleteGroupMessage = catchAsync(async (req, res) => {
  const { messageId } = req.body;

  console.log("🗑️ deleteGroupMessage called:", { messageId });

  // 🆕 VALIDATION: Kiểm tra messageId
  if (!messageId) {
    return res.status(400).json({
      status: "fail",
      message: "messageId is required in request body",
    });
  }

  // 🆕 VALIDATION: Kiểm tra messageId format
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({
      status: "fail",
      message: "Invalid message ID format",
    });
  }

  // Lấy thông tin user từ token
  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({
      status: "fail",
      message: "User not found or unauthorized",
    });
  }

  // Tìm tin nhắn và kiểm tra quyền
  const message = await Message.findById(messageId)
    .populate("sender", "keycloakId username")
    .populate("room");

  if (!message) {
    return res.status(404).json({
      status: "fail",
      message: "Message not found",
    });
  }

  // 🆕 BẢO MẬT: Kiểm tra user có phải là người gửi tin nhắn không
  if (message.sender.keycloakId !== user.keycloakId) {
    console.log("🚫 Unauthorized delete attempt - Group Message:", {
      attacker: user.keycloakId,
      messageOwner: message.sender.keycloakId,
      messageId: messageId,
      timestamp: new Date(),
    });

    return res.status(403).json({
      status: "fail",
      message: "You can only delete your own messages",
    });
  }

  // Kiểm tra room có tồn tại và là group chat không
  const room = await Room.findById(message.room._id);
  if (!room) {
    return res.status(404).json({
      status: "fail",
      message: "Group room not found",
    });
  }

  if (!room.isGroup) {
    return res.status(400).json({
      status: "fail",
      message: "This is a direct conversation, use direct delete endpoint",
    });
  }

  // 🆕 BẢO MẬT: Kiểm tra user có trong group không
  if (!room.members.includes(user.keycloakId)) {
    console.log("🚫 User not in group:", {
      user: user.keycloakId,
      groupMembers: room.members,
    });

    return res.status(403).json({
      status: "fail",
      message: "Access denied to this group",
    });
  }

  // 🆕 BẢO MẬT: Kiểm tra thời gian xóa (chỉ cho phép xóa trong 1 giờ)
  const messageAge = Date.now() - new Date(message.createdAt).getTime();
  const oneHour = 60 * 60 * 1000;

  if (messageAge > oneHour) {
    return res.status(403).json({
      status: "fail",
      message: "You can only delete messages within 1 hour of sending",
    });
  }

  // 🗑️ XÓA TIN NHẮN TỪ DATABASE
  await Message.findByIdAndDelete(messageId);

  console.log("✅ Group message deleted from DB:", {
    messageId,
    deletedBy: user.keycloakId,
    roomId: room._id,
    roomName: room.name,
  });

  // 📡 EMIT SOCKET để thông báo cho tất cả members trong group
  if (req.io) {
    const socketData = {
      messageId: messageId,
      roomId: room._id,
      deletedBy: user.keycloakId,
      isGroup: true,
      timestamp: new Date(),
    };

    req.io.to(room._id.toString()).emit("message_deleted", socketData);

    console.log("📡 Socket emitted for group message deletion:", socketData);
  }

  res.status(200).json({
    status: "success",
    message: "Message deleted successfully",
    data: {
      messageId,
      roomId: room._id,
      roomName: room.name,
      deletedAt: new Date(),
    },
  });
});

// 🆕 THÊM: Unified delete message endpoint (có thể dùng cho cả direct và group)
exports.deleteMessage = catchAsync(async (req, res) => {
  const { messageId, isGroup = false } = req.body; // 🆕 THÊM: isGroup để xác định loại tin nhắn

  console.log("🗑️ deleteMessage called:", { messageId, isGroup });

  if (!messageId) {
    return res.status(400).json({
      status: "fail",
      message: "messageId is required in request body",
    });
  }

  // Lấy thông tin user từ token
  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({
      status: "fail",
      message: "User not found",
    });
  }

  // Tìm tin nhắn và kiểm tra quyền
  const message = await Message.findById(messageId)
    .populate("sender", "keycloakId username")
    .populate("room");

  if (!message) {
    return res.status(404).json({
      status: "fail",
      message: "Message not found",
    });
  }

  // Kiểm tra user có phải là người gửi tin nhắn không
  if (message.sender.keycloakId !== user.keycloakId) {
    return res.status(403).json({
      status: "fail",
      message: "You can only delete your own messages",
    });
  }

  // Kiểm tra room có tồn tại
  const room = await Room.findById(message.room._id);
  if (!room) {
    return res.status(400).json({
      status: "fail",
      message: "Room not found",
    });
  }

  // Kiểm tra loại room có khớp với isGroup không
  if (room.isGroup !== isGroup) {
    return res.status(400).json({
      status: "fail",
      message: "Room type mismatch",
    });
  }

  // Kiểm tra user có trong room không
  if (!room.members.includes(user.keycloakId)) {
    return res.status(403).json({
      status: "fail",
      message: "Access denied to this conversation",
    });
  }

  // 🗑️ XÓA TIN NHẮN TỪ DATABASE
  await Message.findByIdAndDelete(messageId);

  console.log("✅ Message deleted from DB:", { messageId, isGroup });

  // 📡 EMIT SOCKET để thông báo real-time
  if (req.io) {
    const socketData = {
      messageId: messageId,
      deletedBy: user.keycloakId,
      isGroup: isGroup,
      timestamp: new Date(),
    };

    // Thêm room/conversation ID tùy theo loại
    if (isGroup) {
      socketData.roomId = room._id;
    } else {
      socketData.conversationId = room._id;
    }

    req.io.to(room._id.toString()).emit("message_deleted", socketData);

    console.log("📡 Socket emitted for message deletion:", socketData);
  }

  res.status(200).json({
    status: "success",
    message: "Message deleted successfully",
    data: {
      messageId,
      isGroup,
      roomId: room._id,
    },
  });
});
