// services/chatbotService.js
const axios = require("axios");

class ChatbotService {
  constructor() {
    this.chatbotAPIUrl = process.env.CHATBOT_API_URL || "http://localhost:8001";
    this.apiKey = process.env.CHATBOT_API_KEY || "company-chatbot-prod-2024";
    this.timeout = parseInt(process.env.CHATBOT_TIMEOUT) || 30000;
    console.log(`🤖 Chatbot Service initialized: ${this.chatbotAPIUrl}`);
  }

  // Gọi Chatbot API - SỬA: NHẬN USER_INFO THAY VÌ CHỈ USER_ID
  async callChatbotAPI({ user_info, message }) {
    try {
      console.log(
        `📞 Calling chatbot API for user ${
          user_info.user_id
        }: ${message.substring(0, 50)}...`
      );

      // ✅ PAYLOAD MỚI: GỬI TOÀN BỘ USER_INFO
      const payload = {
        user_info: user_info, // ✅ GỬI TOÀN BỘ USER_INFO
        message: message,
      };

      console.log(`📤 Sending payload to chatbot API:`, {
        user_id: user_info.user_id,
        employee_id: user_info.employee_id,
        role: user_info.role,
        department: user_info.department,
      });

      const response = await axios.post(
        `${this.chatbotAPIUrl}/api/v1/chat`,
        payload, // ✅ DÙNG PAYLOAD MỚI
        {
          headers: {
            "X-API-Key": this.apiKey,
            "Content-Type": "application/json",
          },
          timeout: this.timeout,
        }
      );

      console.log(`✅ Chatbot response received for user ${user_info.user_id}`);
      return response.data;
    } catch (error) {
      console.error(
        "❌ Chatbot API Error:",
        error.response?.data || error.message
      );

      // Xử lý lỗi từ chatbot API
      if (error.response?.status === 429) {
        throw new Error("Quá nhiều requests. Vui lòng thử lại sau.");
      } else if (error.response?.status === 401) {
        throw new Error("Lỗi xác thực với chatbot service.");
      } else if (error.code === "ECONNREFUSED") {
        throw new Error("Chatbot service không khả dụng.");
      } else if (error.response?.status === 503) {
        throw new Error("Search service tạm thời không khả dụng.");
      } else {
        throw new Error(
          `Lỗi chatbot service: ${
            error.response?.data?.detail || error.message
          }`
        );
      }
    }
  }

  // Health check chatbot API (giữ nguyên)
  async healthCheck() {
    try {
      console.log(`🔍 Health checking chatbot API: ${this.chatbotAPIUrl}`);
      const response = await axios.get(`${this.chatbotAPIUrl}/api/v1/health`, {
        timeout: 5000,
      });
      return {
        status: "healthy",
        data: response.data,
      };
    } catch (error) {
      console.error("❌ Chatbot health check failed:", error.message);
      return {
        status: "unhealthy",
        error: error.message,
      };
    }
  }
}

// ✅ Export instance
module.exports = new ChatbotService();
