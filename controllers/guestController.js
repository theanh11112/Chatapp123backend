const guestInfo = (req, res) => {
  res.status(200).json({ message: "Thông tin đọc-only cho Guest." });
};

module.exports = { guestInfo };