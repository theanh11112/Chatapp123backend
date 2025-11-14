const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  keycloakId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  fullName: { type: String },
  email: { type: String },
  avatar: { type: String },
  status: { type: String, enum: ["Online", "Offline", "Busy"], default: "Offline" },
  socketId: { type: String },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  roles: { type: [String], default: [] }, // ✅ đảm bảo là array và mặc định rỗng
  isActive: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },
  deviceInfo: [{
    device: String,
    lastSeenAt: Date,
  }],
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
