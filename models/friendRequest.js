const mongoose = require("mongoose");

const friendRequestSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["Pending", "Accepted", "Rejected"], default: "Pending" },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date },
}, { timestamps: true });

friendRequestSchema.index({ sender: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model("FriendRequest", friendRequestSchema);
