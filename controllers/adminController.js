// controllers/adminController.js
const User = require("../models/user");
const Room = require("../models/room");
const Message = require("../models/message");

// -------------------- Dashboard --------------------
exports.getDashboard = (req, res) => {
  res.status(200).json({
    message: "👑 Chào Admin! Đây là trang tổng quan hệ thống nội bộ.",
  });
};

// -------------------- Quản lý người dùng --------------------
exports.getAllUsers = async (req, res) => {
  const users = await User.find().select("firstName lastName email role status");
  res.status(200).json({ status: "success", data: users });
};

exports.updateUserRole = async (req, res) => {
  const { userId, role } = req.body;
  const updatedUser = await User.findByIdAndUpdate(userId, { role }, { new: true });
  res.status(200).json({ message: "Đã cập nhật role người dùng.", data: updatedUser });
};

exports.banUser = async (req, res) => {
  const { userId } = req.body;
  await User.findByIdAndUpdate(userId, { status: "banned" });
  res.status(200).json({ message: "Người dùng đã bị cấm truy cập." });
};

// -------------------- Quản lý phòng chat --------------------
exports.deleteRoom = async (req, res) => {
  await Room.findByIdAndDelete(req.params.roomId);
  res.status(200).json({ message: "Đã xoá phòng chat thành công." });
};

// -------------------- Phân tích & Giám sát --------------------
exports.getSystemStats = async (req, res) => {
  const userCount = await User.countDocuments();
  const roomCount = await Room.countDocuments();
  const messageCount = await Message.countDocuments();

  res.status(200).json({
    status: "success",
    data: {
      userCount,
      roomCount,
      messageCount,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    },
    message: "Thống kê hệ thống được lấy thành công.",
  });
};
