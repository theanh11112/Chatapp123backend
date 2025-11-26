// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["info", "warning", "error", "success"],
      default: "info",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    recipientType: {
      type: String,
      enum: ["all", "user", "admin", "role_based"],
      default: "all",
    },
    recipientIds: [
      {
        type: String, // keycloakId hoặc role
        required: false,
      },
    ],
    source: {
      type: String,
      default: "System",
    },
    actionUrl: {
      type: String,
      required: false, // URL để điều hướng khi click vào thông báo
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Dữ liệu bổ sung
      default: {},
    },
    expiresAt: {
      type: Date,
      required: false, // Thời gian hết hạn thông báo
    },
    createdBy: {
      type: String, // keycloakId của người tạo
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index cho hiệu suất
notificationSchema.index({ recipientType: 1, recipientIds: 1 });
notificationSchema.index({ isRead: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Notification", notificationSchema);
