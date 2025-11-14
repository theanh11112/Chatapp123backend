// controllers/guestController.js
// Lấy danh sách phòng công khai
exports.getPublicRooms = (req, res) => {
  // TODO: thêm logic lấy phòng public từ DB nếu cần
  res.status(200).json({
    message: "📢 Danh sách phòng công khai (Guest view).",
    rooms: [], // tạm thời rỗng, có thể query Room.find({ isPublic: true })
  });
};

// Thông tin giới thiệu cho guest
exports.getGuestInfo = (req, res) => {
  res.status(200).json({
    message: "👋 Chào Guest! Bạn chỉ có thể xem thông tin giới thiệu hệ thống. Hãy đăng nhập để sử dụng các tính năng chat.",
  });
};
