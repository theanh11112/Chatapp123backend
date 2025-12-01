// controllers/adminController.js
const User = require("../models/user");
const Room = require("../models/room");
const Message = require("../models/message");

// -------------------- 1️⃣ Dashboard --------------------
exports.getDashboard = (req, res) => {
  res.status(200).json({
    status: "success",
    message: "👑 Chào Admin! Đây là trang tổng quan hệ thống nội bộ.",
  });
};

// -------------------- 2️⃣ Quản lý người dùng --------------------
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select(
      "username email role status createdAt"
    );
    res.status(200).json({
      status: "success",
      count: users.length,
      data: users,
    });
  } catch (err) {
    console.error("Lỗi khi lấy danh sách user:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Gán role cho người dùng (hỗ trợ 1 hoặc nhiều role)
exports.assignRole = async (req, res) => {
  try {
    const { userId, role, roles: rolesArray } = req.body;

    if (!userId || (!role && !rolesArray)) {
      return res.status(400).json({ message: "Thiếu userId hoặc role(s)!" });
    }

    // Gom tất cả roles thành 1 mảng
    let roles = [];
    if (role) roles.push(role); // Nếu gửi role string
    if (rolesArray) roles = roles.concat(rolesArray); // Nếu gửi mảng

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { roles: { $each: roles } } },
      { new: true }
    );

    if (!updatedUser)
      return res.status(404).json({ message: "Không tìm thấy user." });

    res.status(200).json({
      status: "success",
      message: `✅ Đã gán role(s) [${roles.join(", ")}] cho user ${
        updatedUser.username
      }`,
      data: updatedUser,
    });
  } catch (err) {
    console.error("Lỗi khi gán role:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// Cấm người dùng
exports.banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(
      id,
      { status: "banned" },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "Không tìm thấy user." });

    res.status(200).json({
      status: "success",
      message: `🚫 Người dùng '${user.username}' đã bị cấm.`,
      data: user,
    });
  } catch (err) {
    console.error("Lỗi khi cấm user:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- 3️⃣ Quản lý phòng chat --------------------
exports.deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findByIdAndDelete(roomId);
    if (!room)
      return res.status(404).json({ message: "Không tìm thấy phòng." });

    res.status(200).json({
      status: "success",
      message: `🗑️ Đã xoá phòng '${room.name}' thành công.`,
    });
  } catch (err) {
    console.error("Lỗi khi xoá phòng:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};

// -------------------- 4️⃣ Phân tích & Giám sát --------------------
exports.getSystemAnalytics = async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const roomCount = await Room.countDocuments();
    const messageCount = await Message.countDocuments();

    res.status(200).json({
      status: "success",
      data: {
        userCount,
        roomCount,
        messageCount,
        uptime: process.uptime().toFixed(0) + "s",
        memoryUsage:
          (process.memoryUsage().rss / 1024 / 1024).toFixed(2) + " MB",
      },
      message: "📊 Thống kê hệ thống được lấy thành công.",
    });
  } catch (err) {
    console.error("Lỗi khi lấy thống kê:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
};
