// utils/e2ee.js - Utility functions đơn giản
const crypto = require("crypto");

/**
 * Tạo key pair đơn giản cho E2EE
 */
const generateKeyPair = () => {
  // Sử dụng ECDH cho đơn giản
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();

  return {
    publicKey: ecdh.getPublicKey("base64"),
    privateKey: ecdh.getPrivateKey("base64"),
  };
};

/**
 * Tính fingerprint từ public key
 */
const calculateFingerprint = (publicKey) => {
  return crypto
    .createHash("sha256")
    .update(publicKey)
    .digest("hex")
    .substring(0, 8)
    .toUpperCase();
};

/**
 * Mã hóa tin nhắn với AES-GCM
 */
const encryptMessage = (plaintext, key) => {
  const iv = crypto.randomBytes(12); // 12 bytes cho AES-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag().toString("base64");

  return {
    ciphertext: encrypted,
    iv: iv.toString("base64"),
    authTag,
  };
};

/**
 * Giải mã tin nhắn với AES-GCM
 */
const decryptMessage = (ciphertext, key, iv, authTag) => {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

/**
 * Derive shared secret từ ECDH
 */
const deriveSharedSecret = (privateKey, peerPublicKey) => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(privateKey, "base64"));

  const sharedSecret = ecdh.computeSecret(Buffer.from(peerPublicKey, "base64"));

  // Dùng HKDF để derive key từ shared secret
  return crypto.createHmac("sha256", "e2ee-salt").update(sharedSecret).digest();
};

/**
 * Tạo key ID đơn giản
 */
const generateKeyId = () => {
  return crypto.randomBytes(8).toString("hex");
};

module.exports = {
  generateKeyPair,
  calculateFingerprint,
  encryptMessage,
  decryptMessage,
  deriveSharedSecret,
  generateKeyId,
};
