// models/user.js - PHIÊN BẢN ĐƠN GIẢN
const mongoose = require("mongoose");
const crypto = require("crypto");

// Schema cho E2EE key đơn giản
const e2eeKeySchema = new mongoose.Schema(
  {
    publicKey: {
      type: String, // Public key ở dạng string (base64 hoặc JSON)
      required: true,
    },
    keyType: {
      type: String,
      enum: ["ecdh", "rsa", "ecdh-p256", "ecdh-p384", "ecdh-p521"],
      default: "ecdh",
    },
    fingerprint: {
      type: String, // 8 ký tự đầu của hash
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    // Keycloak
    keycloakId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Thông tin cơ bản
    username: {
      type: String,
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: null,
    },

    // Trạng thái
    status: {
      type: String,
      enum: ["Online", "Offline", "Away"],
      default: "Offline",
      index: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    socketId: {
      type: String,
      index: true,
      sparse: true,
    },

    // Danh sách bạn bè
    friends: [
      {
        type: String, // keycloakId
        index: true,
      },
    ],

    // E2EE đơn giản
    e2eeKeys: {
      type: [e2eeKeySchema],
      default: [],
    },
    e2eeEnabled: {
      type: Boolean,
      default: false,
    },
    currentKeyId: {
      type: String, // ID của key hiện tại đang dùng
      default: null,
    },

    // Các trường cơ bản khác
    isActive: {
      type: Boolean,
      default: true,
    },
    roles: {
      type: [String],
      default: ["user"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ==================== INDEXES ====================
userSchema.index({ username: 1 });
userSchema.index({ status: 1, lastSeen: -1 });
userSchema.index({ "e2eeKeys.fingerprint": 1 });

// ==================== VIRTUALS ====================
userSchema.virtual("isOnline").get(function () {
  return this.status === "Online";
});

userSchema.virtual("currentE2EEKey").get(function () {
  if (!this.e2eeKeys || this.e2eeKeys.length === 0) return null;

  // Tìm key active
  const activeKey = this.e2eeKeys.find((key) => key.isActive);
  return activeKey || this.e2eeKeys[0];
});

// ==================== METHODS ====================
// Thêm E2EE key mới
userSchema.methods.addE2EEKey = function (publicKey, keyType = "ecdh") {
  // Tính fingerprint
  const fingerprint = crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .substring(0, 8)
    .toUpperCase();

  // Đánh dấu key cũ là không active
  this.e2eeKeys.forEach((key) => {
    key.isActive = false;
  });

  // Thêm key mới
  const newKey = {
    publicKey,
    keyType,
    fingerprint,
    createdAt: new Date(),
    isActive: true,
  };

  this.e2eeKeys.push(newKey);
  this.currentKeyId = fingerprint;
  this.e2eeEnabled = true;

  return newKey;
};

// Lấy public key hiện tại
userSchema.methods.getPublicKey = function () {
  const currentKey = this.currentE2EEKey;
  return currentKey ? currentKey.publicKey : null;
};

// Kiểm tra xem user có hỗ trợ E2EE không
userSchema.methods.supportsE2EE = function () {
  return this.e2eeEnabled && this.currentE2EEKey;
};

// ==================== PRE HOOKS ====================
userSchema.pre("save", function (next) {
  // Đảm bảo currentKeyId được set
  if (this.e2eeKeys.length > 0 && !this.currentKeyId) {
    const activeKey = this.e2eeKeys.find((key) => key.isActive);
    if (activeKey) {
      this.currentKeyId = activeKey.fingerprint;
    }
  }

  next();
});

module.exports = mongoose.model("User", userSchema);
