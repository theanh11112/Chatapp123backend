// controllers/userController.js
const Room = require("../models/room");
const User = require("../models/user");
const Message = require("../models/message");
const OneToOneMessage = require("../models/OneToOneMessage");
const Call = require("../models/call");
const catchAsync = require("../utils/catchAsync");
const filterObj = require("../utils/filterObj");
const mongoose = require("mongoose");

exports.setSocketIo = (socketIoInstance) => {
  io = socketIoInstance;
};

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

// 🆕 THÊM: Socket events cho pin/unpin messages - SỬA LẠI NHẬN DATA TỪ BODY
// 🆕 SỬA: Hàm checkUserAccess hỗ trợ cả direct và group chat
// 🆕 SỬA: Hàm checkUserAccess - NHẬN KEYCLOAKID TỪ PARAMETER
const checkUserAccess = async (keycloakId, roomId) => {
  try {
    console.log("🔍 Checking user access:", { keycloakId, roomId });
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      console.log(`❌ Invalid roomId: ${roomId}`);
      return false;
    }

    const room = await Room.findById(roomId);
    if (!room) {
      console.log(`❌ Room not found: ${roomId}`);
      return false;
    }

    const user = await User.findOne({ keycloakId });
    if (!user) {
      console.log(`❌ User not found with keycloakId: ${keycloakId}`);
      return false;
    }

    // 🆕 FIX: Chuẩn hóa so sánh
    if (room.isGroup) {
      // Group chat: members chứa keycloakId (string)
      const hasAccess = room.members && room.members.includes(keycloakId);
      console.log(`🔍 Group room access check: ${hasAccess}`, {
        roomId,
        keycloakId,
        members: room.members,
      });
      return hasAccess;
    } else {
      // Direct chat: members chứa userId (ObjectId) - convert sang string để so sánh
      const hasAccess =
        room.members &&
        room.members.some(
          (member) => member.toString() === user._id.toString()
        );
      console.log(`🔍 Direct room access check: ${hasAccess}`, {
        roomId,
        userId: user._id,
        members: room.members,
      });
      return hasAccess;
    }
  } catch (error) {
    console.error("❌ Error in checkUserAccess:", error);
    return false;
  }
};

// 🆕 SỬA: Hàm handlePinMessage - PHÂN BIỆT DIRECT VÀ GROUP
// 🆕 HOÀN THIỆN: Hàm handlePinMessage với real-time updates
// 🆕 SỬA: handlePinMessage cho schema embedded sender
exports.handlePinMessage = catchAsync(async (socket, data) => {
  const { messageId, roomId } = data;
  const keycloakId = socket.userId;

  console.log("📌 Pin message request:", { messageId, roomId, keycloakId });

  if (!messageId) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Message ID is required",
    });
  }

  // 🆕 SỬA: Không cần populate vì sender là embedded object
  const message = await Message.findById(messageId);

  if (!message) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Message not found",
    });
  }

  // 🆕 DEBUG: Kiểm tra thông tin sender trong message
  console.log("🔍 Message sender debug:", {
    messageId: message._id,
    sender: message.sender,
    hasSender: !!message.sender,
    senderId: message.sender?.id,
    senderName: message.sender?.name,
  });

  // Xác định roomId thực tế từ message
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  // Kiểm tra số lượng tin nhắn được pin
  const pinnedCount = await Message.countDocuments({
    room: actualRoomId,
    isPinned: true,
  });

  if (pinnedCount >= 5) {
    return socket.emit("pin_message_response", {
      status: "error",
      message: "Maximum 5 pinned messages allowed",
    });
  }

  // 🆕 SỬA: Cập nhật message - KHÔNG cần populate
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: true,
      pinnedAt: new Date(),
      pinnedBy: keycloakId,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // 🆕 DEBUG: Kiểm tra message sau khi update
  console.log("🔍 Updated message debug:", {
    messageId: updatedMessage._id,
    isPinned: updatedMessage.isPinned,
    pinnedAt: updatedMessage.pinnedAt,
    pinnedBy: updatedMessage.pinnedBy,
    sender: updatedMessage.sender,
  });

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // 🆕 SỬA: Lấy danh sách pinned messages - KHÔNG cần populate
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // 🆕 DEBUG: Kiểm tra dữ liệu pinned messages
  console.log("🔍 Pinned messages debug:", {
    count: pinnedMessages.length,
    messages: pinnedMessages.map((msg) => ({
      id: msg._id,
      sender: msg.sender,
      senderId: msg.sender?.id,
      senderName: msg.sender?.name,
      content: msg.content,
      pinnedAt: msg.pinnedAt,
    })),
  });

  // Gửi event đến tất cả users trong room
  socket.to(actualRoomId).emit("message_pinned", {
    messageId: messageId,
    chatType: chatType,
    roomId: actualRoomId,
    pinnedAt: updatedMessage.pinnedAt,
    pinnedBy: keycloakId,
    pinnedMessages: pinnedMessages, // 🆕 GỬI DANH SÁCH ĐẦY ĐỦ
  });

  // BROADCAST: Cập nhật danh sách pinned messages
  socket.to(actualRoomId).emit("pinned_messages_updated", {
    roomId: actualRoomId,
    chatType: chatType,
    pinnedMessages: pinnedMessages,
    action: "pin",
    messageId: messageId,
  });

  // Response cho user thực hiện
  socket.emit("pin_message_response", {
    status: "success",
    message: "Message pinned successfully",
    data: {
      messageId: messageId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
    },
  });

  console.log("✅ Message pinned:", {
    messageId,
    chatType,
    roomId: actualRoomId,
    pinnedMessagesCount: pinnedMessages.length,
    senderName: message.sender?.name, // 🆕 THÊM sender name để debug
  });
});

// 🆕 HOÀN THIỆN: Hàm handleUnpinMessage với real-time updates
// 🆕 SỬA: handleUnpinMessage cho schema embedded sender
exports.handleUnpinMessage = catchAsync(async (socket, data) => {
  const { messageId, roomId } = data;
  const keycloakId = socket.userId;

  console.log("📌 Unpin message request:", { messageId, roomId, keycloakId });

  if (!messageId) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Message ID is required",
    });
  }

  // Tìm message để kiểm tra
  const message = await Message.findById(messageId);
  if (!message) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Message not found",
    });
  }

  // 🆕 DEBUG: Kiểm tra sender trước khi unpin
  console.log("🔍 Message to unpin debug:", {
    messageId: message._id,
    sender: message.sender,
    isPinned: message.isPinned,
  });

  // Xác định roomId thực tế từ message
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  if (!message.isPinned) {
    return socket.emit("unpin_message_response", {
      status: "error",
      message: "Message is not pinned",
    });
  }

  // 🆕 SỬA: Cập nhật message
  await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // 🆕 SỬA: Lấy danh sách pinned messages mới nhất
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // 🆕 CẢI THIỆN: Gửi event với đầy đủ thông tin
  socket.to(actualRoomId).emit("message_unpinned", {
    messageId: messageId,
    chatType: chatType,
    roomId: actualRoomId,
    pinnedMessages: pinnedMessages,
  });

  // 🆕 BROADCAST: Cập nhật danh sách pinned messages cho tất cả clients
  socket.to(actualRoomId).emit("pinned_messages_updated", {
    roomId: actualRoomId,
    chatType: chatType,
    pinnedMessages: pinnedMessages,
    action: "unpin",
    messageId: messageId,
  });

  // Response cho user thực hiện
  socket.emit("unpin_message_response", {
    status: "success",
    message: "Message unpinned successfully",
    data: {
      messageId: messageId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
    },
  });

  console.log("✅ Message unpinned:", {
    messageId,
    chatType,
    roomId: actualRoomId,
    pinnedMessagesCount: pinnedMessages.length,
    senderName: message.sender?.name, // 🆕 THÊM sender name để debug
  });
});

// 🆕 HOÀN THIỆN: Hàm getPinnedMessages
// 🆕 SỬA: getPinnedMessages cho schema embedded sender
exports.getPinnedMessages = catchAsync(async (req, res) => {
  const { roomId, keycloakId } = req.body;

  if (!roomId || !keycloakId) {
    return res.status(400).json({
      status: "error",
      message: "Room ID and User ID are required in request body",
    });
  }

  console.log(
    "📌 Fetching pinned messages for room:",
    roomId,
    "user:",
    keycloakId
  );

  // Kiểm tra quyền truy cập
  const hasAccess = await checkUserAccess(keycloakId, roomId);
  if (!hasAccess) {
    return res.status(403).json({
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  // 🆕 SỬA: Lấy pinned messages - KHÔNG cần populate
  const pinnedMessages = await Message.find({
    room: roomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // 🆕 DEBUG: Log để kiểm tra dữ liệu trả về
  console.log("🔍 API Pinned messages debug:", {
    count: pinnedMessages.length,
    messages: pinnedMessages.map((msg) => ({
      id: msg._id,
      sender: msg.sender,
      senderId: msg.sender?.id,
      senderName: msg.sender?.name,
      content: msg.content,
      pinnedAt: msg.pinnedAt,
    })),
  });

  console.log(
    `✅ Found ${pinnedMessages.length} pinned messages for room ${roomId}`
  );

  res.status(200).json({
    status: "success",
    results: pinnedMessages.length,
    data: pinnedMessages,
  });
});

// 🆕 HOÀN THIỆN: Hàm pinMessage cho HTTP API
// 🆕 SỬA: pinMessage cho HTTP API với schema embedded sender
exports.pinMessage = catchAsync(async (req, res) => {
  const { messageId, roomId, keycloakId } = req.body;

  if (!messageId || !keycloakId) {
    return res.status(400).json({
      status: "error",
      message: "Message ID and User ID are required",
    });
  }

  // Tìm message để lấy roomId
  const message = await Message.findById(messageId);
  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  // 🆕 DEBUG: Kiểm tra sender trong message gốc
  console.log("🔍 Original message sender:", {
    sender: message.sender,
    senderId: message.sender?.id,
    senderName: message.sender?.name,
  });

  // Xác định roomId thực tế
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền truy cập
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return res.status(403).json({
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  // Kiểm tra số lượng tin nhắn được pin
  const pinnedCount = await Message.countDocuments({
    room: actualRoomId,
    isPinned: true,
  });

  if (pinnedCount >= 5) {
    return res.status(400).json({
      status: "error",
      message: "Maximum 5 pinned messages allowed",
    });
  }

  // 🆕 SỬA: Sử dụng findByIdAndUpdate thay vì save()
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: true,
      pinnedAt: new Date(),
      pinnedBy: keycloakId,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // 🆕 SỬA: Lấy danh sách pinned messages mới nhất
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // Gửi socket event
  if (req.app.get("io")) {
    const io = req.app.get("io");

    io.to(actualRoomId).emit("message_pinned", {
      messageId: messageId,
      chatType: chatType,
      roomId: actualRoomId,
      pinnedMessages: pinnedMessages,
    });

    io.to(actualRoomId).emit("pinned_messages_updated", {
      roomId: actualRoomId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
      action: "pin",
      messageId: messageId,
    });
  }

  res.status(200).json({
    status: "success",
    message: "Message pinned successfully",
    data: {
      message: updatedMessage,
      pinnedMessages: pinnedMessages,
    },
  });
});

// 🆕 HOÀN THIỆN: Hàm unpinMessage cho HTTP API
// 🆕 SỬA: unpinMessage cho HTTP API với schema embedded sender
exports.unpinMessage = catchAsync(async (req, res) => {
  const { messageId, roomId, keycloakId } = req.body;

  if (!messageId || !keycloakId) {
    return res.status(400).json({
      status: "error",
      message: "Message ID and User ID are required",
    });
  }

  // Tìm message để lấy roomId
  const message = await Message.findById(messageId);
  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  // Xác định roomId thực tế
  const actualRoomId = roomId || message.room.toString();

  // Kiểm tra quyền truy cập
  const hasAccess = await checkUserAccess(keycloakId, actualRoomId);
  if (!hasAccess) {
    return res.status(403).json({
      status: "error",
      message: "Access denied to this conversation",
    });
  }

  if (!message.isPinned) {
    return res.status(400).json({
      status: "error",
      message: "Message is not pinned",
    });
  }

  // 🆕 SỬA: Sử dụng findByIdAndUpdate thay vì save()
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      isPinned: false,
      pinnedAt: null,
      pinnedBy: null,
    },
    {
      new: true,
      runValidators: false,
    }
  );

  // 🆕 SỬA: Lấy danh sách pinned messages mới nhất
  const pinnedMessages = await Message.find({
    room: actualRoomId,
    isPinned: true,
  })
    .sort({ pinnedAt: -1 })
    .lean();

  // Xác định chatType
  const room = await Room.findById(actualRoomId);
  const chatType = room && room.isGroup ? "group" : "individual";

  // Gửi socket event
  if (req.app.get("io")) {
    const io = req.app.get("io");

    io.to(actualRoomId).emit("message_unpinned", {
      messageId: messageId,
      chatType: chatType,
      roomId: actualRoomId,
      pinnedMessages: pinnedMessages,
    });

    io.to(actualRoomId).emit("pinned_messages_updated", {
      roomId: actualRoomId,
      chatType: chatType,
      pinnedMessages: pinnedMessages,
      action: "unpin",
      messageId: messageId,
    });
  }

  res.status(200).json({
    status: "success",
    message: "Message unpinned successfully",
    data: {
      message: updatedMessage,
      pinnedMessages: pinnedMessages,
    },
  });
});
