// models/Settings.js
const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      unique: true,
      ref: "User",
    },
    // Cài đặt thông báo
    notifications: {
      message: { type: Boolean, default: true },
      preview: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
      desktop: { type: Boolean, default: true },
      mobile: { type: Boolean, default: false },
    },
    // Cài đặt bảo mật
    privacy: {
      lastSeen: {
        type: String,
        enum: ["everyone", "contacts", "nobody"],
        default: "everyone",
      },
      profilePhoto: {
        type: String,
        enum: ["everyone", "contacts", "nobody"],
        default: "everyone",
      },
      status: {
        type: String,
        enum: ["everyone", "contacts", "nobody"],
        default: "everyone",
      },
      readReceipts: { type: Boolean, default: true },
      typingIndicators: { type: Boolean, default: true },
    },
    // Cài đặt chung
    general: {
      language: { type: String, default: "vi" },
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      fontSize: {
        type: String,
        enum: ["small", "medium", "large"],
        default: "medium",
      },
    },
    // Cài đặt chat
    chat: {
      enterToSend: { type: Boolean, default: true },
      emojiPicker: { type: Boolean, default: true },
      mediaAutoDownload: { type: Boolean, default: true },
      saveToCameraRoll: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index để tối ưu truy vấn
settingsSchema.index({ user: 1 });

// Middleware tự động tạo settings khi user mới được tạo
settingsSchema.statics.initializeForUser = async function (keycloakId) {
  try {
    const existingSettings = await this.findOne({ user: keycloakId });
    if (!existingSettings) {
      return await this.create({ user: keycloakId });
    }
    return existingSettings;
  } catch (error) {
    console.error("Error initializing settings for user:", error);
    throw error;
  }
};

module.exports = mongoose.model("Settings", settingsSchema);
