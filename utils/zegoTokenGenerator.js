// utils/zegoTokenGenerator.js
const crypto = require("crypto");

/**
 * Generate Zego token for authentication
 * @param {number} appId - Zego app ID
 * @param {string} userId - User ID
 * @param {string} secret - Zego server secret
 * @param {number} effectiveTime - Token effective time in seconds
 * @param {string} payload - Additional payload data
 * @returns {string} - Generated token
 */
function generateToken04(appId, userId, secret, effectiveTime, payload) {
  if (!appId || !userId || !secret) {
    throw new Error("appId, userId, and secret are required");
  }

  // Create token information
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: Math.floor(Math.random() * 1000000),
    ctime: Math.floor(Date.now() / 1000),
    expire: Math.floor(Date.now() / 1000) + effectiveTime,
    payload: payload || "",
  };

  // Encode token information
  const tokenInfoStr = JSON.stringify(tokenInfo);
  const tokenInfoBase64 = Buffer.from(tokenInfoStr).toString("base64");

  // Generate signature
  const hash = crypto.createHmac("sha256", secret);
  hash.update(tokenInfoBase64);
  const signature = hash.digest("hex");

  // Combine token
  const token = `${tokenInfoBase64}.${signature}`;

  return token;
}

/**
 * Verify Zego token
 * @param {string} token - Token to verify
 * @param {string} secret - Zego server secret
 * @returns {Object} - Verification result
 */
function verifyToken04(token, secret) {
  if (!token || !secret) {
    return { isValid: false, error: "Token and secret are required" };
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return { isValid: false, error: "Invalid token format" };
    }

    const tokenInfoBase64 = parts[0];
    const signature = parts[1];

    // Verify signature
    const hash = crypto.createHmac("sha256", secret);
    hash.update(tokenInfoBase64);
    const expectedSignature = hash.digest("hex");

    if (signature !== expectedSignature) {
      return { isValid: false, error: "Invalid signature" };
    }

    // Parse token info
    const tokenInfoStr = Buffer.from(tokenInfoBase64, "base64").toString();
    const tokenInfo = JSON.parse(tokenInfoStr);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (tokenInfo.expire < now) {
      return { isValid: false, error: "Token expired" };
    }

    return {
      isValid: true,
      tokenInfo: tokenInfo,
    };
  } catch (error) {
    return { isValid: false, error: error.message };
  }
}

/**
 * Generate basic token for testing (without payload)
 * @param {number} appId - Zego app ID
 * @param {string} userId - User ID
 * @param {string} secret - Zego server secret
 * @param {number} effectiveTime - Token effective time in seconds
 * @returns {string} - Generated token
 */
function generateBasicToken(appId, userId, secret, effectiveTime = 3600) {
  return generateToken04(appId, userId, secret, effectiveTime, "");
}

module.exports = {
  generateToken04,
  verifyToken04,
  generateBasicToken,
};
