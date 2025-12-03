// Chat-App-Backend/routes/zegoRoutes.js
const express = require("express");
const router = express.Router();
const {
  generateBasicToken,
  verifyToken04,
  generateTestTokens,
} = require("../utils/zegoTokenGenerator");

// Load Zego configuration from .env
const ZEGO_APP_ID = parseInt(process.env.ZEGO_APP_ID) || 0;
const ZEGO_SERVER_SECRET = process.env.ZEGO_SERVER_SECRET || "";

/**
 * Middleware: Check if Zego is properly configured
 */
const checkZegoConfig = (req, res, next) => {
  if (!ZEGO_APP_ID || ZEGO_APP_ID === 0) {
    console.error("❌ ZEGO_APP_ID is not configured");
    return res.status(500).json({
      success: false,
      error: "Server configuration error: ZEGO_APP_ID is missing",
      code: "CONFIG_ERROR",
    });
  }

  if (!ZEGO_SERVER_SECRET || ZEGO_SERVER_SECRET === "") {
    console.error("❌ ZEGO_SERVER_SECRET is not configured");
    return res.status(500).json({
      success: false,
      error: "Server configuration error: ZEGO_SERVER_SECRET is missing",
      code: "CONFIG_ERROR",
    });
  }

  console.log(`✅ Zego Config Check: App ID = ${ZEGO_APP_ID}`);
  next();
};

/**
 * Middleware: Validate request body
 */
const validateTokenRequest = (req, res, next) => {
  const { userId, roomId, effectiveTime } = req.body;

  // Check required fields
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    return res.status(400).json({
      success: false,
      error: "User ID is required and must be a non-empty string",
      code: "INVALID_USER_ID",
    });
  }

  // Validate effectiveTime if provided
  if (effectiveTime !== undefined) {
    const time = parseInt(effectiveTime);
    if (isNaN(time) || time <= 0 || time > 7 * 24 * 3600) {
      return res.status(400).json({
        success: false,
        error:
          "effectiveTime must be a positive number not exceeding 7 days (604800 seconds)",
        code: "INVALID_EFFECTIVE_TIME",
      });
    }
  }

  next();
};

/**
 * @route   POST /api/zego/token
 * @desc    Generate Zego authentication token
 * @access  Public
 * @body    {string} userId - Required: Unique user identifier
 * @body    {string} roomId - Optional: Room identifier
 * @body    {string} userName - Optional: Display name
 * @body    {number} effectiveTime - Optional: Token validity in seconds (default: 3600)
 * @body    {Object} payload - Optional: Additional data to include in token
 */
router.post("/token", checkZegoConfig, validateTokenRequest, (req, res) => {
  try {
    const {
      userId,
      roomId,
      userName,
      effectiveTime = 3600,
      payload = "",
    } = req.body;

    console.log(
      `🔐 Generating token for user: ${userId}, room: ${roomId || "N/A"}`
    );

    // Generate token
    const token = generateBasicToken(
      ZEGO_APP_ID,
      userId,
      ZEGO_SERVER_SECRET,
      parseInt(effectiveTime)
    );

    // Create response
    const response = {
      success: true,
      token,
      appId: ZEGO_APP_ID,
      userId,
      userName: userName || `User_${userId.substring(0, 8)}`,
      roomId: roomId || `room_${Date.now()}`,
      effectiveTime: parseInt(effectiveTime),
      expiresAt: new Date(
        Date.now() + parseInt(effectiveTime) * 1000
      ).toISOString(),
      generatedAt: new Date().toISOString(),
      tokenType: "zego_token_v04",
    };

    console.log(`✅ Token generated successfully for user ${userId}`);

    res.status(200).json(response);
  } catch (error) {
    console.error("❌ Token generation error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to generate authentication token",
      message: error.message,
      code: "TOKEN_GENERATION_ERROR",
    });
  }
});

/**
 * @route   POST /api/zego/verify
 * @desc    Verify a Zego token
 * @access  Public
 * @body    {string} token - Required: Token to verify
 */
router.post("/verify", checkZegoConfig, (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        error: "Token is required and must be a string",
        code: "INVALID_TOKEN",
      });
    }

    console.log("🔍 Verifying token...");

    // Verify token
    const verificationResult = verifyToken04(token, ZEGO_SERVER_SECRET);

    if (verificationResult.isValid) {
      res.status(200).json({
        success: true,
        isValid: true,
        tokenInfo: verificationResult.tokenInfo,
        expiresIn: verificationResult.expiresIn,
        expiresAt: verificationResult.expiresAt,
        verifiedAt: new Date().toISOString(),
      });
    } else {
      res.status(401).json({
        success: true, // API call succeeded, but token is invalid
        isValid: false,
        error: verificationResult.error,
        verifiedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ Token verification error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to verify token",
      message: error.message,
      code: "TOKEN_VERIFICATION_ERROR",
    });
  }
});

/**
 * @route   GET /api/zego/config
 * @desc    Get Zego configuration (App ID only - secret is never exposed)
 * @access  Public
 */
router.get("/config", checkZegoConfig, (req, res) => {
  res.status(200).json({
    success: true,
    appId: ZEGO_APP_ID,
    note: "Server secret is never exposed to client for security reasons",
    tokenEndpoint: "/api/zego/token",
    verifyEndpoint: "/api/zego/verify",
    supports: ["token_v04", "room_based_authentication"],
  });
});

/**
 * @route   GET /api/zego/test-tokens
 * @desc    Generate test tokens for development
 * @access  Public (should be disabled in production)
 */
router.get("/test-tokens", checkZegoConfig, (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      success: false,
      error: "Test tokens are only available in development mode",
      code: "FORBIDDEN_IN_PRODUCTION",
    });
  }

  try {
    const testTokens = generateTestTokens(ZEGO_APP_ID, ZEGO_SERVER_SECRET);

    res.status(200).json({
      success: true,
      message: "Test tokens generated for development",
      appId: ZEGO_APP_ID,
      tokens: testTokens,
      warning: "DO NOT USE THESE IN PRODUCTION",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Test token generation error:", error);

    res.status(500).json({
      success: false,
      error: "Failed to generate test tokens",
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/zego/health
 * @desc    Check Zego service health
 * @access  Public
 */
router.get("/health", checkZegoConfig, (req, res) => {
  const healthStatus = {
    success: true,
    service: "Zego Authentication Service",
    status: "operational",
    timestamp: new Date().toISOString(),
    appIdConfigured: !!ZEGO_APP_ID,
    secretConfigured: !!ZEGO_SERVER_SECRET,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    nodeVersion: process.version,
  };

  console.log("🏥 Health check passed");
  res.status(200).json(healthStatus);
});

module.exports = router;
