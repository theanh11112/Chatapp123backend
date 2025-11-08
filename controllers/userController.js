// controllers/userController.js
const Room = require("../models/room");
const User = require("../models/user");
const Message = require("../models/message");
const AudioCall = require("../models/audioCall");
const VideoCall = require("../models/videoCall");
const catchAsync = require("../utils/catchAsync");
const filterObj = require("../utils/filterObj");

// -------------------- Profile --------------------
exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ status: "success", data: req.user });
});

exports.updateMe = catchAsync(async (req, res) => {
  const filteredBody = filterObj(req.body, "firstName", "lastName", "about", "avatar");
  const userDoc = await User.findByIdAndUpdate(req.user._id, filteredBody, { new: true });
  res.status(200).json({ message: "Cập nhật thông tin thành công", data: userDoc });
});

// -------------------- Chat / Room --------------------
exports.createRoom = async (req, res) => {
  const { name, members } = req.body;
  const newRoom = await Room.create({ name, members, createdBy: req.user._id });
  res.status(201).json({ message: "Đã tạo phòng nhóm thành công", data: newRoom });
};

// -------------------- Messaging --------------------
exports.sendMessage = async (req, res) => {
  const { roomId, content } = req.body;
  const message = await Message.create({
    sender: req.user._id,
    room: roomId,
    content,
  });
  res.status(200).json({ message: "Đã gửi tin nhắn", data: message });
};
