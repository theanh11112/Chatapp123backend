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

  // 🆕 SỬA: Convert roomId string thành ObjectId để query
  const roomObjectId = new mongoose.Types.ObjectId(roomId);

  const room = await Room.findOne({
    _id: roomObjectId,
    members: user.keycloakId,
  });
  if (!room) return res.status(403).json({ message: "Access denied" });

  const skip = (page - 1) * limit;

  // 🆕 SỬA: Sử dụng roomObjectId thay vì roomId string
  let messages = await Message.find({ room: roomObjectId })
    .populate("sender", "keycloakId username firstName lastName avatar")
    .populate("replyTo")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  console.log("🔍 Messages found:", messages.length);
  console.log("🔍 Query details:", {
    roomId: roomId,
    roomObjectId: roomObjectId,
    roomExists: !!room,
  });

  messages = messages.reverse();

  res.status(200).json({
    status: "success",
    results: messages.length,
    pagination: { page, limit },
    data: messages,
  });
});

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
