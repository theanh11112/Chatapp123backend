// models/user.js
const mongoose = require("mongoose");
const crypto = require("crypto");

const e2eeKeySchema = new mongoose.Schema(
  {
    publicKey: { type: String, required: true },
    keyType: {
      type: String,
      enum: ["ecdh", "rsa", "ecdh-p256", "ecdh-p384", "ecdh-p521"],
      default: "ecdh",
    },
    keyVersion: { type: Number, default: 1 },
    fingerprint: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    keycloakId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, index: true },
    fullName: { type: String, default: "" },
    email: { type: String, default: "" },
    avatar: { type: String, default: null },
    status: {
      type: String,
      enum: ["Online", "Offline", "Away"],
      default: "Offline",
      index: true,
    },
    lastSeen: { type: Date, default: Date.now },
    socketId: { type: String, index: true, sparse: true },
    friends: [{ type: String, index: true }],

    // Keep history of public keys
    e2eeKeys: { type: [e2eeKeySchema], default: [] },
    e2eeEnabled: { type: Boolean, default: false },
    currentKeyId: { type: String, default: null },

    isActive: { type: Boolean, default: true },
    roles: { type: [String], default: ["user"] },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Index on keys fingerprint for fast lookup
userSchema.index({ "e2eeKeys.fingerprint": 1 });

// Virtuals
userSchema.virtual("isOnline").get(function () {
  return this.status === "Online";
});

userSchema.virtual("currentE2EEKey").get(function () {
  if (!this.e2eeKeys || this.e2eeKeys.length === 0) return null;
  const activeKey = this.e2eeKeys.find((key) => key.isActive);
  return activeKey || this.e2eeKeys[this.e2eeKeys.length - 1];
});

// Methods

/**
 * addE2EEKey(publicKey, keyType, options)
 * - Keep history: push new key into e2eeKeys
 * - Mark previous keys isActive = false
 * - Set currentKeyId = new fingerprint
 */
userSchema.methods.addE2EEKey = function (
  publicKey,
  keyType = "ecdh",
  options = {}
) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .substring(0, 8)
    .toUpperCase();

  // mark previous keys inactive (we still keep them in history)
  this.e2eeKeys.forEach((k) => {
    k.isActive = false;
  });

  const newKey = {
    publicKey,
    keyType,
    fingerprint,
    createdAt: options.createdAt || new Date(),
    isActive: true,
  };

  this.e2eeKeys.push(newKey);
  this.currentKeyId = fingerprint;
  this.e2eeEnabled = true;

  return newKey;
};

userSchema.methods.getPublicKeyByFingerprint = function (fingerprint) {
  if (!fingerprint)
    return this.currentE2EEKey ? this.currentE2EEKey.publicKey : null;
  const fp = (fingerprint || "").toUpperCase();
  return (this.e2eeKeys || []).find((k) => k.fingerprint === fp) || null;
};

userSchema.methods.getPublicKeyLatest = function () {
  const k = this.currentE2EEKey;
  return k
    ? { publicKey: k.publicKey, fingerprint: k.fingerprint, keyType: k.keyType }
    : null;
};

userSchema.methods.supportsE2EE = function () {
  return this.e2eeEnabled && this.currentE2EEKey;
};

// Pre-save ensure currentKeyId set
userSchema.pre("save", function (next) {
  if (this.e2eeKeys.length > 0 && !this.currentKeyId) {
    const activeKey = this.e2eeKeys.find((key) => key.isActive);
    if (activeKey) this.currentKeyId = activeKey.fingerprint;
  }
  next();
});

module.exports = mongoose.model("User", userSchema);
