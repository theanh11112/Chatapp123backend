const mongoose = require("mongoose");

const callSchema = new mongoose.Schema({
  type: { type: String, enum: ["audio", "video"], required: true },
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  status: { type: String, enum: ["Ongoing", "Ended"], default: "Ongoing" },
}, { timestamps: true });

module.exports = mongoose.model("Call", callSchema);
