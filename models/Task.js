// models/Task.js
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    // 🆕 THAY ĐỔI: assigneeId thành mảng
    assigneeIds: {
      type: [String], // Mảng keycloakIds
      required: true,
      validate: {
        validator: function (v) {
          return v.length > 0; // Phải có ít nhất 1 người nhận
        },
        message: "Task phải có ít nhất 1 người nhận",
      },
    },
    assignerId: {
      type: String, // keycloakId của người giao
      required: true,
    },
    status: {
      type: String,
      enum: ["todo", "in_progress", "review", "done"],
      default: "todo",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    dueDate: {
      type: Date,
      default: null,
    },
    tags: [String],
    estimatedHours: {
      type: Number,
      default: 0,
    },
    activityLog: [
      {
        action: String,
        userId: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        details: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
taskSchema.index({ assignerId: 1 });
taskSchema.index({ assigneeIds: 1 }); // 🆕 Index cho mảng assigneeIds
taskSchema.index({ status: 1 });
taskSchema.index({ dueDate: 1 });

module.exports = mongoose.model("Task", taskSchema);
