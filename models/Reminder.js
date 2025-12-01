// models/Reminder.js - THÊM FIELD isCompleted
const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema(
  {
    // 🎯 THÔNG TIN CƠ BẢN
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    userId: {
      type: String, // keycloakId của người sở hữu reminder
      required: true,
    },
    remindAt: {
      type: Date,
      required: true,
    },

    // 🎯 TRẠNG THÁI
    isSent: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // 🆕 THÊM FIELD isCompleted
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },

    // 🎯 LOẠI REMINDER
    reminderType: {
      type: String,
      enum: [
        "personal", // Nhắc nhở cá nhân
        "meeting", // Cuộc họp
        "deadline", // Hạn chót
        "task_reminder", // Nhắc nhở về task
        "birthday", // Sinh nhật
        "appointment", // Lịch hẹn
        "custom", // Tùy chỉnh
      ],
      default: "personal",
    },

    // 🎯 LIÊN KẾT TASK (OPTIONAL)
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
reminderSchema.index({ userId: 1, remindAt: 1 });
reminderSchema.index({ remindAt: 1, isSent: 1 });
reminderSchema.index({ taskId: 1 });
reminderSchema.index({ reminderType: 1 });
reminderSchema.index({ isCompleted: 1 }); // 🆕 THÊM INDEX CHO isCompleted

// Virtual methods
reminderSchema.virtual("isTaskReminder").get(function () {
  return !!this.taskId;
});

reminderSchema.virtual("isPersonalReminder").get(function () {
  return !this.taskId;
});

reminderSchema.virtual("isOverdue").get(function () {
  return !this.isSent && this.remindAt < new Date();
});

// 🆕 Virtual để kiểm tra reminder đã hoàn thành
reminderSchema.virtual("isDone").get(function () {
  return this.isCompleted;
});

module.exports = mongoose.model("Reminder", reminderSchema);
