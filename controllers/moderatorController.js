// controllers/moderatorController.js
const User = require("../models/user");
const Room = require("../models/room");
const Message = require("../models/message");

// -------------------- Dashboard --------------------
exports.getDashboard = (req, res) => {
  res.status(200).json({
    message: "🛡️ Chào Moderator! Đây là khu vực kiểm duyệt hệ thống.",
  });
};

// -------------------- Kiểm duyệt người dùng --------------------

// Lấy tất cả người dùng
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select(
      "firstName lastName email role status"
    );
    res.status(200).json({ status: "success", data: users });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Lấy danh sách người dùng đã được xác thực (status = "active")
exports.getVerifiedUsers = async (req, res) => {
  try {
    const users = await User.find({ status: "active" }).select(
      "firstName lastName email role status"
    );
    res.status(200).json({ status: "success", data: users });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Gửi cảnh báo tới người dùng
exports.warnUser = async (req, res) => {
  try {
    const { id } = req.params; // lấy id từ URL
    const { reason } = req.body;
    // TODO: logic gửi notification/email thật
    res
      .status(200)
      .json({ message: `Đã gửi cảnh báo đến user ${id} với lý do: ${reason}` });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Tạm khóa người dùng
exports.banUserTemporary = async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndUpdate(userId, { status: "suspended" });
    res.status(200).json({ message: "Người dùng đã bị tạm khóa tài khoản." });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- Quản lý phòng & tin nhắn --------------------

// Xoá phòng chat
exports.deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    await Room.findByIdAndDelete(roomId);
    res.status(200).json({ message: "Moderator đã xoá phòng chat." });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Xoá tin nhắn vi phạm
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params; // lấy id từ URL
    await Message.findByIdAndDelete(id);
    res.status(200).json({ message: "Tin nhắn vi phạm đã bị xoá." });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- Thống kê --------------------

// Thống kê cơ bản
exports.getBasicStats = async (req, res) => {
  try {
    const users = await User.countDocuments();
    const rooms = await Room.countDocuments();
    res.status(200).json({ status: "success", data: { users, rooms } });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Xem thống kê chi tiết (bao gồm số tin nhắn)
exports.viewStatistics = async (req, res) => {
  try {
    const users = await User.countDocuments();
    const rooms = await Room.countDocuments();
    const messages = await Message.countDocuments();
    res
      .status(200)
      .json({ status: "success", data: { users, rooms, messages } });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
