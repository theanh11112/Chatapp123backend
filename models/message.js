// models/message.js - PHIÊN BẢN ĐƠN GIẢN
const mongoose = require("mongoose");

// Schema cho dữ liệu mã hóa
const encryptionDataSchema = new mongoose.Schema(
  {
    ciphertext: {
      type: String,
      required: function () {
        return this.parent().isEncrypted === true;
      },
    },
    iv: {
      type: String, // Initialization Vector
      required: function () {
        return this.parent().isEncrypted === true;
      },
    },
    keyId: {
      type: String, // ID của key dùng để mã hóa
      required: true,
    },
    algorithm: {
      type: String,
      default: "AES-GCM-256",
      enum: ["AES-GCM-256", "AES-GCM-128"],
    },
  },
  { _id: false }
);

const senderSchema = new mongoose.Schema(
  {
    id: {
      type: String, // keycloakId
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },

    sender: {
      type: senderSchema,
      required: true,
    },

    type: {
      type: String,
      enum: [
        "text",
        "image",
        "file",
        "video",
        "audio",
        "system",
        "encrypted", // Tin nhắn mã hóa
      ],
      default: "text",
      index: true,
    },

    content: {
      type: String,
      required: function () {
        return this.type !== "encrypted";
      },
    },

    // E2EE fields đơn giản
    isEncrypted: {
      type: Boolean,
      default: false,
      index: true,
    },

    encryptionData: {
      type: encryptionDataSchema,
      default: null,
    },

    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attachment",
      },
    ],

    seenBy: [
      {
        type: String, // keycloakId
        index: true,
      },
    ],
    seenCount: {
      type: Number,
      default: 0,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: String,
      default: null,
    },

    reactions: [
      {
        emoji: String,
        user: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    reactionCount: {
      type: Number,
      default: 0,
    },

    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "message",
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        // Chỉ hiển thị encryption data nếu là tin nhắn mã hóa
        if (!ret.isEncrypted) {
          delete ret.encryptionData;
        }
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// ==================== INDEXES ====================
messageSchema.index({ createdAt: -1 });
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ isEncrypted: 1 });
messageSchema.index({ "encryptionData.keyId": 1 });

// ==================== VIRTUALS ====================
messageSchema.virtual("isDeleted").get(function () {
  return !!this.deletedAt;
});

messageSchema.virtual("displayContent").get(function () {
  if (this.isDeleted) {
    return "Tin nhắn đã bị xóa";
  }
  if (this.isEncrypted) {
    return "🔒 Tin nhắn mã hóa";
  }
  return this.content;
});

// ==================== METHODS ====================
messageSchema.methods.markAsSeen = function (userId) {
  if (!this.seenBy.includes(userId)) {
    this.seenBy.push(userId);
    this.seenCount = this.seenBy.length;
  }
  return this;
};

messageSchema.methods.addReaction = function (emoji, userId) {
  const existingIndex = this.reactions.findIndex(
    (r) => r.emoji === emoji && r.user === userId
  );

  if (existingIndex > -1) {
    this.reactions.splice(existingIndex, 1);
  } else {
    this.reactions.push({ emoji, user: userId, createdAt: new Date() });
  }

  this.reactionCount = this.reactions.length;
  return this;
};

// Kiểm tra xem tin nhắn có thể decrypt được không
messageSchema.methods.canDecrypt = function () {
  return (
    this.isEncrypted &&
    this.encryptionData &&
    this.encryptionData.ciphertext &&
    this.encryptionData.iv &&
    this.encryptionData.keyId
  );
};

// ==================== PRE HOOKS ====================
messageSchema.pre("save", function (next) {
  // Tự động cập nhật counters
  if (Array.isArray(this.seenBy)) {
    this.seenCount = this.seenBy.length;
  }

  if (Array.isArray(this.reactions)) {
    this.reactionCount = this.reactions.length;
  }

  // Tự động set type nếu là encrypted
  if (this.isEncrypted) {
    this.type = "encrypted";
  }

  // Validate encrypted messages
  if (
    this.isEncrypted &&
    (!this.encryptionData ||
      !this.encryptionData.ciphertext ||
      !this.encryptionData.iv)
  ) {
    return next(new Error("Tin nhắn mã hóa cần có ciphertext và iv"));
  }

  next();
});

module.exports = mongoose.model("Message", messageSchema);
