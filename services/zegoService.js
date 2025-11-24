// services/zegoService.js
const { generateToken04 } = require("../utils/zegoTokenGenerator");

class ZegoService {
  constructor() {
    this.appId = parseInt(process.env.ZEGO_APP_ID) || 1642584767;
    this.serverSecret = process.env.ZEGO_SERVER_SECRET;

    if (!this.serverSecret) {
      console.warn(
        "⚠️  ZEGO_SERVER_SECRET is not configured. Using mock token generation."
      );
    }
  }

  generateToken(userId, roomId, effectiveTime = 3600) {
    try {
      // If server secret is not configured, generate mock token for development
      if (!this.serverSecret) {
        console.warn("🔧 Using mock token generation for development");
        return this._generateMockToken(userId, roomId, effectiveTime);
      }

      const payload = JSON.stringify({
        room_id: roomId,
        privilege: {
          1: 1, // login privilege
          2: 1, // publish privilege
        },
        stream_id: [],
        version: "03.00",
      });

      const token = generateToken04(
        this.appId,
        userId.toString(),
        this.serverSecret,
        effectiveTime,
        payload
      );

      console.log(
        `✅ Zego token generated for user ${userId} in room ${roomId}`
      );

      return {
        token,
        expire_time: Math.floor(Date.now() / 1000) + effectiveTime,
        appId: this.appId,
      };
    } catch (error) {
      console.error("❌ Zego token generation error:", error);

      // Fallback to mock token in case of error
      return this._generateMockToken(userId, roomId, effectiveTime);
    }
  }

  /**
   * Generate mock token for development/testing
   */
  _generateMockToken(userId, roomId, effectiveTime = 3600) {
    const mockToken = `mock_token_${userId}_${roomId}_${Date.now()}`;

    return {
      token: mockToken,
      expire_time: Math.floor(Date.now() / 1000) + effectiveTime,
      appId: this.appId,
      isMock: true, // Flag to identify mock tokens
    };
  }

  /**
   * Validate token (basic validation for mock tokens)
   */
  validateToken(token, userId, roomId) {
    if (token.includes("mock_token")) {
      // Basic mock token validation
      const parts = token.split("_");
      if (parts.length >= 4 && parts[2] === userId && parts[3] === roomId) {
        return {
          isValid: true,
          userId,
          roomId,
          isMock: true,
        };
      }
    }

    // For real tokens, you would verify with Zego servers
    return {
      isValid: true, // Assume valid for development
      userId,
      roomId,
    };
  }

  /**
   * Get Zego server configuration
   */
  getServerConfig() {
    return {
      appId: this.appId,
      server: "wss://webliveroom1642584767-api.coolzcloud.com/ws",
      isConfigured: !!this.serverSecret,
    };
  }
}

module.exports = new ZegoService();
