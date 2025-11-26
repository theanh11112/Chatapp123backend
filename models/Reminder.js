// models/Reminder.js
const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    userId: {
      type: String, // 🆕 THAY ĐỔI: String thay vì ObjectId
      required: true,
    },
    remindAt: {
      type: Date,
      required: true,
    },
    message: {
      type: String,
      default: "Nhắc nhở task của bạn!",
    },
    isSent: {
      type: Boolean,
      default: false,
    },
    reminderType: {
      type: String,
      enum: ["due_date", "custom", "start_date"],
      default: "custom",
    },
  },
  {
    timestamps: true,
  }
);

// Index để job reminder chạy nhanh
reminderSchema.index({ remindAt: 1, isSent: 1 });
reminderSchema.index({ taskId: 1 });

module.exports = mongoose.model("Reminder", reminderSchema);
