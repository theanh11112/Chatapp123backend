const mongoose = require("mongoose");

const deviceInfoSchema = new mongoose.Schema(
  {
    device: { type: String, required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    keycloakId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    avatar: { type: String, trim: true },

    status: {
      type: String,
      enum: ["Online", "Offline", "Busy"],
      default: "Offline",
    },

    socketId: { type: String, index: true },

    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },

    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    roles: {
      type: [String],
      default: [],
      validate: (arr) => Array.isArray(arr),
    },

    isActive: { type: Boolean, default: true },

    lastSeen: { type: Date, default: Date.now },
    lastLoginAt: { type: Date },

    deviceInfo: {
      type: [deviceInfoSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
