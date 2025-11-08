// controllers/moderatorController.js
const User = require("../models/user");
const Room = require("../models/room");
const Message = require("../models/message");

// -------------------- Dashboard --------------------
exports.getDashboard = (req, res) => {
  res.status(200).json({ message: "🛡️ Chào Moderator! Đây là khu vực kiểm duyệt hệ thống." });
};

// -------------------- Kiểm duyệt người dùng --------------------
exports.getAllUsers = async (req, res) => {
  const users = await User.find().select("firstName lastName email role status");
  res.status(200).json({ status: "success", data: users });
};

exports.warnUser = async (req, res) => {
  const { userId, reason } = req.body;
  // Thay bằng logic gửi cảnh báo thật (notification/email)
  res.status(200).json({ message: `Đã gửi cảnh báo đến user ${userId} với lý do: ${reason}` });
};

exports.banUserTemporary = async (req, res) => {
  const { userId } = req.body;
  await User.findByIdAndUpdate(userId, { status: "suspended" });
  res.status(200).json({ message: "Người dùng đã bị tạm khóa tài khoản." });
};

// -------------------- Quản lý phòng & tin nhắn --------------------
exports.deleteRoom = async (req, res) => {
  await Room.findByIdAndDelete(req.params.roomId);
  res.status(200).json({ message: "Moderator đã xoá phòng chat." });
};

exports.deleteMessage = async (req, res) => {
  await Message.findByIdAndDelete(req.params.messageId);
  res.status(200).json({ message: "Tin nhắn vi phạm đã bị xoá." });
};

// -------------------- Thống kê --------------------
exports.getBasicStats = async (req, res) => {
  const users = await User.countDocuments();
  const rooms = await Room.countDocuments();
  res.status(200).json({ status: "success", data: { users, rooms } });
};
// controllers/moderatorController.js
const User = require("../models/user");
const Room = require("../models/room");
const Message = require("../models/message");

// -------------------- Dashboard --------------------
exports.getDashboard = (req, res) => {
  res.status(200).json({ message: "🛡️ Chào Moderator! Đây là khu vực kiểm duyệt hệ thống." });
};

// -------------------- Kiểm duyệt người dùng --------------------
exports.getAllUsers = async (req, res) => {
  const users = await User.find().select("firstName lastName email role status");
  res.status(200).json({ status: "success", data: users });
};

exports.warnUser = async (req, res) => {
  const { userId, reason } = req.body;
  // Thay bằng logic gửi cảnh báo thật (notification/email)
  res.status(200).json({ message: `Đã gửi cảnh báo đến user ${userId} với lý do: ${reason}` });
};

exports.banUserTemporary = async (req, res) => {
  const { userId } = req.body;
  await User.findByIdAndUpdate(userId, { status: "suspended" });
  res.status(200).json({ message: "Người dùng đã bị tạm khóa tài khoản." });
};

// -------------------- Quản lý phòng & tin nhắn --------------------
exports.deleteRoom = async (req, res) => {
  await Room.findByIdAndDelete(req.params.roomId);
  res.status(200).json({ message: "Moderator đã xoá phòng chat." });
};

exports.deleteMessage = async (req, res) => {
  await Message.findByIdAndDelete(req.params.messageId);
  res.status(200).json({ message: "Tin nhắn vi phạm đã bị xoá." });
};

// -------------------- Thống kê --------------------
exports.getBasicStats = async (req, res) => {
  const users = await User.countDocuments();
  const rooms = await Room.countDocuments();
  res.status(200).json({ status: "success", data: { users, rooms } });
};
