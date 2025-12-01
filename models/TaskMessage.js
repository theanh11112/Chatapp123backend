// models/TaskMessage.js
const mongoose = require("mongoose");

const taskMessageSchema = new mongoose.Schema(
  {
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    senderId: {
      type: String, // keycloakId
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    messageType: {
      type: String,
      enum: ["text", "file", "system"],
      default: "text",
    },
    fileUrl: {
      type: String,
      default: null,
    },
    fileName: {
      type: String,
      default: null,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaskMessage",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes cho performance
taskMessageSchema.index({ taskId: 1, createdAt: -1 });
taskMessageSchema.index({ senderId: 1, createdAt: -1 });
taskMessageSchema.index({ taskId: 1, senderId: 1 });

// Virtual để populate thông tin sender từ User collection
taskMessageSchema.virtual("sender", {
  ref: "User",
  localField: "senderId",
  foreignField: "keycloakId",
  justOne: true,
});

// Virtual để populate replyTo message
taskMessageSchema.virtual("replyToMessage", {
  ref: "TaskMessage",
  localField: "replyTo",
  foreignField: "_id",
  justOne: true,
});

// Enable virtuals
taskMessageSchema.set("toJSON", { virtuals: true });
taskMessageSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("TaskMessage", taskMessageSchema);
