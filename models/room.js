const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  name: { type: String },
  isGroup: { type: Boolean, default: false },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
  topic: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("Room", roomSchema);
