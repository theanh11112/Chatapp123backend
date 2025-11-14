const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["text", "image", "file", "video", "system"], default: "text" },
  content: { type: String },
  attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
  seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  editedAt: { type: Date },
  deletedAt: { type: Date },
  reactions: [{
    emoji: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  }],
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
