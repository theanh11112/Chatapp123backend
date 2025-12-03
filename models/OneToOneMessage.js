const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

// Schema cho từng tin nhắn con
const messageSubSchema = new mongoose.Schema(
  {
    _id: { type: String, default: uuidv4 },
    from: { type: String, required: true },
    to: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "image", "file", "video", "system", "reply", "encrypted"], // 🆕 THÊM "encrypted"
      default: "text",
    },
    content: { type: String, required: true },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],

    // 🆕 THÊM: Các trường cho E2EE cơ bản
    isEncrypted: {
      type: Boolean,
      default: false,
    },
    encryptionData: {
      ciphertext: { type: String, default: null },
      iv: { type: String, default: null },
      keyId: { type: String, default: null }, // ID của key dùng để mã hóa
      algorithm: { type: String, default: "AES-GCM-256" },
    },

    // 🆕 THÊM: Các trường cho tính năng reply
    replyTo: {
      type: String,
      default: null,
    },
    replyContent: {
      type: String,
      default: null,
    },
    replySender: {
      keycloakId: { type: String, default: null },
      username: { type: String, default: null },
      name: { type: String, default: null },
      avatar: { type: String, default: null },
    },
    replyType: {
      type: String,
      enum: ["text", "image", "file", "video", "system", "encrypted"],
      default: "text",
    },
    createdAt: { type: Date, default: Date.now },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    seen: { type: Boolean, default: false },

    // 🆕 THÊM: Delivery tracking cho E2EE
    delivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

// Schema chính cho cuộc trò chuyện
const oneToOneMessageSchema = new mongoose.Schema(
  {
    participants: [{ type: String, required: true }],
    messages: [messageSubSchema],

    // 🆕 THÊM: Trạng thái E2EE của cuộc trò chuyện
    e2eeEnabled: {
      type: Boolean,
      default: false,
    },
    lastKeyExchange: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Index để tìm kiếm nhanh
oneToOneMessageSchema.index({ participants: 1 });
oneToOneMessageSchema.index({ "messages.from": 1 });
oneToOneMessageSchema.index({ "messages.to": 1 });
oneToOneMessageSchema.index({ "messages.replyTo": 1 });
oneToOneMessageSchema.index({ "messages.isEncrypted": 1 }); // 🆕 THÊM: Index cho encrypted messages
oneToOneMessageSchema.index({ "messages.encryptionData.keyId": 1 }); // 🆕 THÊM: Index cho keyId

// 🆕 THÊM: Pre-save hook để tự động set type nếu encrypted
messageSubSchema.pre("save", function (next) {
  if (this.isEncrypted) {
    this.type = "encrypted";
  }
  next();
});

// 🆕 THÊM: Method kiểm tra tin nhắn có thể decrypt được không
messageSubSchema.methods.canDecrypt = function () {
  return (
    this.isEncrypted &&
    this.encryptionData &&
    this.encryptionData.ciphertext &&
    this.encryptionData.iv &&
    this.encryptionData.keyId
  );
};

// 🆕 THÊM: Method đánh dấu đã gửi thành công
messageSubSchema.methods.markDelivered = function () {
  this.delivered = true;
  this.deliveredAt = new Date();
  return this;
};

const OneToOneMessage = mongoose.model(
  "OneToOneMessage",
  oneToOneMessageSchema
);

module.exports = OneToOneMessage;
