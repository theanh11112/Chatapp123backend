// controllers/botController.js
exports.sendNotification = async (req, res) => {
  const { message } = req.body;
  console.log("🤖 Bot gửi thông báo:", message);
  res.status(200).json({ status: "success", message: "Bot đã gửi thông báo tới tất cả người dùng." });
};

exports.autoReply = async (req, res) => {
  const { text } = req.body;
  const reply = text.includes("help")
    ? "🤖 Tôi có thể giúp bạn! Hãy nhập 'support' để liên hệ đội kỹ thuật."
    : "🤖 Cảm ơn bạn đã gửi tin nhắn!";
  res.status(200).json({ reply });
};
