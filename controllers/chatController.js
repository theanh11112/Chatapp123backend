// controllers/chatController.js
const ChatSession = require("../models/ChatSession");
const chatbotService = require("../services/chatbotService"); // ✅ SỬA IMPORT
const { cleanupOldSessions } = require("../services/cleanupService");

class ChatController {
  // Gửi tin nhắn mới - GỌI CHATBOT API
  async sendMessage(req, res) {
    try {
      const { user_info, message } = req.body;
      console.log("111111", user_info);

      // Validate input
      if (!user_info || !message) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu thông tin user_info hoặc message",
        });
      }

      const { user_id, employee_id, department, role, permission_level } =
        user_info;

      if (!user_id || !employee_id) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu thông tin user_id hoặc employee_id",
        });
      }

      // 1. Tìm hoặc tạo chat session
      let chatSession = await ChatSession.findOne({
        user_id,
        is_active: true,
      }).sort({ updated_at: -1 });

      // Nếu không có session hoặc session cũ hơn 4 giờ, tạo session mới
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      if (!chatSession || chatSession.updated_at < fourHoursAgo) {
        chatSession = new ChatSession({
          user_id,
          employee_id,
          department,
          role,
          permission_level,
          messages: [],
        });
      }

      // 2. Tạo tin nhắn user
      const userMessage = {
        id: Date.now().toString(),
        type: "user",
        content: message,
        timestamp: new Date(),
      };

      // Thêm tin nhắn user vào session
      chatSession.messages.push(userMessage);

      // 3. GỌI CHATBOT API - SỬA CÁCH GỌI
      const chatbotResponse = await chatbotService.callChatbotAPI({
        user_info: user_info,
        message: message,
      });

      // 4. Tạo tin nhắn bot từ chatbot response
      const botMessage = {
        id: (Date.now() + 1).toString(),
        type: "bot",
        content: chatbotResponse.response,
        source: chatbotResponse.source,
        category: chatbotResponse.category,
        confidence: chatbotResponse.confidence,
        total_results: chatbotResponse.total_results,
        timestamp: new Date(),
      };

      // Thêm tin nhắn bot vào session
      chatSession.messages.push(botMessage);

      // 5. Lưu session
      await chatSession.save();

      // 6. Tự động cleanup sessions cũ
      cleanupOldSessions().catch(console.error);

      // 7. Trả về response
      res.json({
        status: "success",
        response: botMessage.content,
        source: botMessage.source,
        category: botMessage.category,
        confidence: botMessage.confidence,
        total_results: botMessage.total_results,
        session_id: chatSession._id,
        message_id: botMessage.id,
      });
    } catch (error) {
      console.error("Error in sendMessage:", error);
      res.status(500).json({
        status: "error",
        message: "Lỗi server khi xử lý tin nhắn",
        error: error.message,
      });
    }
  }

  // Lấy lịch sử chat - NHẬN user_id QUA BODY
  async getChatHistory(req, res) {
    try {
      const { user_id, limit = 50 } = req.body;

      if (!user_id) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu user_id",
        });
      }

      // Tìm session active gần nhất
      const chatSession = await ChatSession.findOne({
        user_id,
        is_active: true,
      }).sort({ updated_at: -1 });

      if (!chatSession) {
        return res.json({
          status: "success",
          messages: [],
          session_id: null,
        });
      }

      // Giới hạn số lượng tin nhắn trả về
      const messages = chatSession.messages.slice(-limit);

      res.json({
        status: "success",
        messages,
        session_id: chatSession._id,
        total_messages: chatSession.messages.length,
      });
    } catch (error) {
      console.error("Error in getChatHistory:", error);
      res.status(500).json({
        status: "error",
        message: "Lỗi server khi lấy lịch sử chat",
      });
    }
  }

  // Xóa lịch sử chat - NHẬN user_id QUA BODY
  async clearChatHistory(req, res) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu user_id",
        });
      }

      // Deactivate all sessions của user
      await ChatSession.updateMany(
        { user_id, is_active: true },
        { is_active: false }
      );

      res.json({
        status: "success",
        message: "Đã xóa lịch sử chat",
      });
    } catch (error) {
      console.error("Error in clearChatHistory:", error);
      res.status(500).json({
        status: "error",
        message: "Lỗi server khi xóa lịch sử chat",
      });
    }
  }

  // Lấy tất cả sessions của user - NHẬN user_id QUA BODY
  async getUserSessions(req, res) {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu user_id",
        });
      }

      const sessions = await ChatSession.find({ user_id })
        .sort({ updated_at: -1 })
        .select("_id created_at updated_at messages_count is_active")
        .lean();

      // Đếm số tin nhắn cho mỗi session
      const sessionsWithCount = sessions.map((session) => ({
        ...session,
        messages_count: session.messages ? session.messages.length : 0,
      }));

      res.json({
        status: "success",
        sessions: sessionsWithCount,
      });
    } catch (error) {
      console.error("Error in getUserSessions:", error);
      res.status(500).json({
        status: "error",
        message: "Lỗi server khi lấy sessions",
      });
    }
  }

  // Health check chatbot service - SỬA CÁCH GỌI
  async healthCheck(req, res) {
    try {
      const health = await chatbotService.healthCheck();

      res.json({
        status: "success",
        chatbot_service: health.status,
        details: health.data || health.error,
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        message: "Lỗi khi kiểm tra chatbot service",
        error: error.message,
      });
    }
  }
}

module.exports = new ChatController();
