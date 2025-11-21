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
      enum: ["text", "image", "file", "video", "system", "reply"], // 🆕 THÊM "reply"
      default: "text",
    },
    content: { type: String, required: true },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
    // 🆕 THÊM: Các trường cho tính năng reply
    replyTo: {
      type: String, // ID của message được reply (UUID string)
      default: null,
    },
    replyContent: {
      type: String, // Nội dung của message gốc
      default: null,
    },
    replySender: {
      // Thông tin người gửi message gốc
      keycloakId: { type: String, default: null },
      username: { type: String, default: null },
      name: { type: String, default: null },
      avatar: { type: String, default: null },
    },
    replyType: {
      // Loại message gốc (text, image, file, video, system)
      type: String,
      enum: ["text", "image", "file", "video", "system"],
      default: "text",
    },
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
// 🆕 THÊM: Index cho reply để tìm kiếm nhanh
oneToOneMessageSchema.index({ "messages.replyTo": 1 });

const OneToOneMessage = mongoose.model(
  "OneToOneMessage",
  oneToOneMessageSchema
);

module.exports = OneToOneMessage;
