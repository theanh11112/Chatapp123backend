// models/auditLog.js
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  user: { type: String, ref: "User" },
  action: { type: String, required: true },
  targetId: { type: String },
  metadata: Object,
  ip: String,
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema); // ✅ CommonJS
