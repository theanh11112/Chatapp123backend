const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    sender: {
      id: {
        type: String, // keycloakId
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "video", "system", "reply"],
      default: "text",
    },
    content: { type: String },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
    seenBy: [{ type: String }], // keycloakId của users đã xem
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    replyContent: {
      // 🆕 THÊM: Lưu content của message được reply
      type: String,
    },
    replySender: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    reactions: [
      {
        emoji: String,
        user: { type: String }, // keycloakId của user reaction
      },
    ],
  },
  { timestamps: true, collection: "message" }
);

module.exports = mongoose.model("Message", messageSchema);
