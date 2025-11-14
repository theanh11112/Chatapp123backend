// controllers/userController.js
const Room = require("../models/room");
const User = require("../models/user");
const Message = require("../models/message");
const Call = require("../models/call"); // Sử dụng schema chung audio/video
const catchAsync = require("../utils/catchAsync");
const filterObj = require("../utils/filterObj");

// -------------------- Profile --------------------
exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ status: "success", data: req.user });
});

// Alias cho route "/me" GET
exports.getProfile = exports.getMe;

exports.updateMe = catchAsync(async (req, res) => {
  const filteredBody = filterObj(req.body, "firstName", "lastName", "about", "avatar");
  const userDoc = await User.findByIdAndUpdate(req.user._id, filteredBody, { new: true });
  res.status(200).json({ message: "Cập nhật thông tin thành công", data: userDoc });
});

// Alias cho route "/me" PATCH
exports.updateProfile = exports.updateMe;

// -------------------- Chat / Room --------------------
exports.createRoom = catchAsync(async (req, res) => {
  const { name, members } = req.body;
  const newRoom = await Room.create({ name, members, createdBy: req.user._id });
  res.status(201).json({ message: "Đã tạo phòng nhóm thành công", data: newRoom });
});

// Alias cho route "/room" POST private room
exports.createPrivateRoom = exports.createRoom;

// -------------------- Messaging --------------------
exports.sendMessage = catchAsync(async (req, res) => {
  const { roomId, content } = req.body;
  const message = await Message.create({
    sender: req.user._id,
    room: roomId,
    content,
  });
  res.status(200).json({ message: "Đã gửi tin nhắn", data: message });
});

// -------------------- Friends --------------------
exports.getFriends = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate(
    "friends",
    "fullName username email avatar"
  );
  res.status(200).json({ status: "success", data: user.friends });
});

// -------------------- Calls --------------------

// Tạo cuộc gọi (audio/video)
exports.createCall = catchAsync(async (req, res) => {
  const { type, roomId, participants } = req.body;

  if (!["audio", "video"].includes(type)) {
    return res.status(400).json({ message: "Loại cuộc gọi không hợp lệ" });
  }

  const call = await Call.create({
    type,
    room: roomId,
    participants,
  });

  res.status(201).json({ message: "Cuộc gọi đã được tạo", data: call });
});

// Kết thúc cuộc gọi
exports.endCall = catchAsync(async (req, res) => {
  const { callId } = req.body;

  const call = await Call.findByIdAndUpdate(
    callId,
    { status: "Ended", endedAt: Date.now() },
    { new: true }
  );

  if (!call) {
    return res.status(404).json({ message: "Không tìm thấy cuộc gọi" });
  }

  res.status(200).json({ message: "Cuộc gọi đã kết thúc", data: call });
});

// Lấy lịch sử call theo user
exports.getCallHistory = catchAsync(async (req, res) => {
  const calls = await Call.find({ participants: req.user._id })
    .populate("participants", "fullName username avatar")
    .populate("room", "name");

  res.status(200).json({ status: "success", data: calls });
});
