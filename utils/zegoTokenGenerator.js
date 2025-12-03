// Chat-App-Backend/utils/zegoTokenGenerator.js
const crypto = require("crypto");

/**
 * Generate Zego token for authentication (Version 04)
 * @param {number} appId - Zego app ID
 * @param {string} userId - User ID
 * @param {string} secret - Zego server secret
 * @param {number} effectiveTime - Token effective time in seconds
 * @param {string} payload - Additional payload data
 * @returns {string} - Generated token
 */
function generateToken04(appId, userId, secret, effectiveTime, payload) {
  // Validate inputs
  if (!appId || typeof appId !== "number") {
    throw new Error("appId must be a number");
  }

  if (!userId || typeof userId !== "string") {
    throw new Error("userId must be a string");
  }

  if (!secret || typeof secret !== "string") {
    throw new Error("secret must be a string");
  }

  if (effectiveTime <= 0) {
    throw new Error("effectiveTime must be positive");
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

  // Encode token information to base64
  const tokenInfoStr = JSON.stringify(tokenInfo);
  const tokenInfoBase64 = Buffer.from(tokenInfoStr).toString("base64");

  // Generate HMAC-SHA256 signature
  const hash = crypto.createHmac("sha256", secret);
  hash.update(tokenInfoBase64);
  const signature = hash.digest("hex");

  // Combine base64 and signature
  const token = `${tokenInfoBase64}.${signature}`;

  console.log(
    `🔐 Generated token for user ${userId}, valid for ${effectiveTime} seconds`
  );
  return token;
}

/**
 * Generate basic token for testing (without payload)
 * @param {number} appId - Zego app ID
 * @param {string} userId - User ID
 * @param {string} secret - Zego server secret
 * @param {number} effectiveTime - Token effective time in seconds (default: 1 hour)
 * @returns {string} - Generated token
 */
function generateBasicToken(appId, userId, secret, effectiveTime = 3600) {
  return generateToken04(appId, userId, secret, effectiveTime, "");
}

/**
 * Verify Zego token
 * @param {string} token - Token to verify
 * @param {string} secret - Zego server secret
 * @returns {Object} - Verification result
 */
function verifyToken04(token, secret) {
  if (!token || typeof token !== "string") {
    return { isValid: false, error: "Token is required and must be a string" };
  }

  if (!secret || typeof secret !== "string") {
    return { isValid: false, error: "Secret is required and must be a string" };
  }

  try {
    // Split token into parts
    const parts = token.split(".");
    if (parts.length !== 2) {
      return {
        isValid: false,
        error: "Invalid token format. Expected 'base64.signature'",
      };
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
    const tokenInfoStr = Buffer.from(tokenInfoBase64, "base64").toString(
      "utf8"
    );
    const tokenInfo = JSON.parse(tokenInfoStr);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (tokenInfo.expire < now) {
      return {
        isValid: false,
        error: "Token expired",
        expiredAt: new Date(tokenInfo.expire * 1000).toISOString(),
      };
    }

    // Validate token structure
    if (!tokenInfo.app_id || !tokenInfo.user_id || !tokenInfo.expire) {
      return { isValid: false, error: "Invalid token structure" };
    }

    return {
      isValid: true,
      tokenInfo: tokenInfo,
      expiresIn: tokenInfo.expire - now,
      expiresAt: new Date(tokenInfo.expire * 1000).toISOString(),
    };
  } catch (error) {
    return {
      isValid: false,
      error: `Token verification failed: ${error.message}`,
    };
  }
}

/**
 * Generate test tokens for development
 * @param {number} appId - Zego app ID
 * @param {string} secret - Zego server secret
 * @returns {Object} - Test tokens
 */
function generateTestTokens(appId, secret) {
  const now = Math.floor(Date.now() / 1000);

  const tokens = {
    // Valid token (expires in 1 hour)
    validToken: generateBasicToken(appId, "test_user_001", secret, 3600),

    // Expired token (expired 1 hour ago)
    expiredToken: generateToken04(
      appId,
      "test_user_002",
      secret,
      3600,
      ""
    ).replace(/"expire":\d+/, `"expire":${now - 3600}`),

    // Admin token with payload
    adminToken: generateToken04(
      appId,
      "admin_user",
      secret,
      7200, // 2 hours
      JSON.stringify({ role: "admin", permissions: ["manage_rooms"] })
    ),
  };

  console.log("🧪 Generated test tokens for development");
  return tokens;
}

module.exports = {
  generateToken04,
  generateBasicToken,
  verifyToken04,
  generateTestTokens,
};
