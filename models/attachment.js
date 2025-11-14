const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema({
  message: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  fileName: String,
  fileUrl: String,
  fileType: String,
  fileSize: Number,
}, { timestamps: true });

module.exports = mongoose.model("Attachment", attachmentSchema);
