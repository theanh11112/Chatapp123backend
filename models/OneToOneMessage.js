const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Schema cho từng tin nhắn con
const messageSubSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 }, // UUID string thay vì ObjectId
    from: { type: String, required: true },
    to: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "image", "file", "video", "system"],
      default: "text",
    },
    content: { type: String, required: true },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
    createdAt: { type: Date, default: Date.now },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    seen: { type: Boolean, default: false },
  },
  { _id: true }
); // vẫn giữ _id nhưng là string

// Schema chính cho cuộc trò chuyện
const oneToOneMessageSchema = new mongoose.Schema(
  {
    participants: [{ type: String, required: true }],
    messages: [messageSubSchema],
  },
  { timestamps: true }
);

// Index để tìm kiếm nhanh
oneToOneMessageSchema.index({ participants: 1 });
oneToOneMessageSchema.index({ "messages.from": 1 });
oneToOneMessageSchema.index({ "messages.to": 1 });

const OneToOneMessage = mongoose.model(
  "OneToOneMessage",
  oneToOneMessageSchema
);

module.exports = OneToOneMessage;
