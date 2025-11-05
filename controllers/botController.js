module.exports = {
  botInfo: (req, res) => {
    res.status(200).json({ message: "Thông tin nội bộ của Bot." });
  },
};