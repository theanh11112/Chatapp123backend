// controllers/guestController.js
exports.getGuestInfo = (req, res) => {
  res.status(200).json({
    message: "👋 Chào Guest! Bạn chỉ có thể xem thông tin giới thiệu hệ thống. Hãy đăng nhập để sử dụng các tính năng chat.",
  });
};
