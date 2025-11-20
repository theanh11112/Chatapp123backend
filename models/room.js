const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: { type: String },
    isGroup: { type: Boolean, default: true },
    members: [{ type: String }], // keycloakId của users
    createdBy: { type: String }, // keycloakId của user tạo phòng
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
    topic: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
