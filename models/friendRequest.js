const mongoose = require("mongoose");

const friendRequestSchema = new mongoose.Schema(
  {
    sender: { type: String, required: true }, // keycloakId của người gửi
    recipient: { type: String, required: true }, // keycloakId của người nhận
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected"],
      default: "Pending",
    },
    createdAt: { type: Date, default: Date.now },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

// Index để đảm bảo không có 2 request pending giữa cùng 2 user
friendRequestSchema.index(
  { sender: 1, recipient: 1 },
  { unique: true, partialFilterExpression: { status: "Pending" } }
);

module.exports = mongoose.model("FriendRequest", friendRequestSchema);
