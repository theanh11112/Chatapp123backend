// models/Task.js
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Tiêu đề task là bắt buộc"],
      trim: true,
      maxlength: [255, "Tiêu đề không quá 255 ký tự"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    assignerId: {
      type: String, // 🆕 THAY ĐỔI: String thay vì ObjectId
      required: true,
    },
    assigneeId: {
      type: String, // 🆕 THAY ĐỔI: String thay vì ObjectId
      required: true,
    },
    status: {
      type: String,
      enum: ["todo", "in_progress", "review", "done"],
      default: "todo",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    dueDate: {
      type: Date,
      required: false,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    estimatedHours: {
      type: Number,
      min: 0,
    },
    actualHours: {
      type: Number,
      min: 0,
      default: 0,
    },
    activityLog: [
      {
        action: String,
        userId: String, // 🆕 THAY ĐỔI: String
        timestamp: Date,
        details: Object,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index để query nhanh hơn
taskSchema.index({ assigneeId: 1, status: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ assignerId: 1 });

module.exports = mongoose.model("Task", taskSchema);
