const catchAsync = require("../utils/catchAsync");
const User = require("../models/user");
const Message = require("../models/message");
const Room = require("../models/room");

exports.getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.status(200).json({ status: "success", data: user });
});

exports.updateProfile = catchAsync(async (req, res) => {
  const updated = await User.findByIdAndUpdate(req.user._id, req.body, { new: true });
  res.status(200).json({ status: "success", data: updated, message: "Profile updated successfully" });
});

exports.getChatRooms = catchAsync(async (req, res) => {
  const rooms = await Room.find({ participants: req.user._id }).populate("participants", "firstName lastName");
  res.status(200).json({ status: "success", data: rooms });
});

exports.sendMessage = catchAsync(async (req, res) => {
  const { roomId, content } = req.body;
  const message = await Message.create({ sender: req.user._id, room: roomId, content });
  res.status(200).json({ status: "success", data: message });
});
const catchAsync = require("../utils/catchAsync");
const User = require("../models/user");
const Message = require("../models/message");
const Room = require("../models/room");

exports.getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.status(200).json({ status: "success", data: user });
});

exports.updateProfile = catchAsync(async (req, res) => {
  const updated = await User.findByIdAndUpdate(req.user._id, req.body, { new: true });
  res.status(200).json({ status: "success", data: updated, message: "Profile updated successfully" });
});

exports.getChatRooms = catchAsync(async (req, res) => {
  const rooms = await Room.find({ participants: req.user._id }).populate("participants", "firstName lastName");
  res.status(200).json({ status: "success", data: rooms });
});

exports.sendMessage = catchAsync(async (req, res) => {
  const { roomId, content } = req.body;
  const message = await Message.create({ sender: req.user._id, room: roomId, content });
  res.status(200).json({ status: "success", data: message });
});
const catchAsync = require("../utils/catchAsync");
const User = require("../models/user");
const Message = require("../models/message");
const Room = require("../models/room");

exports.getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  res.status(200).json({ status: "success", data: user });
});

exports.updateProfile = catchAsync(async (req, res) => {
  const updated = await User.findByIdAndUpdate(req.user._id, req.body, { new: true });
  res.status(200).json({ status: "success", data: updated, message: "Profile updated successfully" });
});

exports.getChatRooms = catchAsync(async (req, res) => {
  const rooms = await Room.find({ participants: req.user._id }).populate("participants", "firstName lastName");
  res.status(200).json({ status: "success", data: rooms });
});

exports.sendMessage = catchAsync(async (req, res) => {
  const { roomId, content } = req.body;
  const message = await Message.create({ sender: req.user._id, room: roomId, content });
  res.status(200).json({ status: "success", data: message });
});
