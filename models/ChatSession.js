// models/ChatSession.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["user", "bot", "error"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    // THÊM CÁC FIELD MỚI ĐỂ LƯU CHATBOT RESPONSE
    source: {
      type: String,
      default: null, // Nguồn tài liệu (title từ search)
    },
    category: {
      type: String,
      default: null, // Danh mục tài liệu
    },
    confidence: {
      type: Number,
      default: null, // Độ tin cậy từ search
    },
    total_results: {
      type: Number,
      default: 0, // Tổng số kết quả tìm thấy
    },
    // GIỮ NGUYÊN CÁC FIELD CŨ
    data: [
      {
        title: String,
        content: String,
        category: String,
        confidence: Number,
      },
    ],
    suggestions: [String],
    timestamp: {
      type: String,
      required: true,
    },
    // THÊM TIMESTAMP DẠNG DATE ĐỂ SORT DỄ DÀNG
    timestamp_date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatSessionSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true,
  },
  employee_id: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    required: true,
  },
  permission_level: {
    type: String,
    required: true,
  },
  messages: [messageSchema],
  created_at: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  // THÊM FIELD ĐỂ THEO DÕI CHATBOT USAGE
  total_messages: {
    type: Number,
    default: 0,
  },
  last_bot_response: {
    source: String,
    category: String,
    confidence: Number,
  },
});

// Tự động cập nhật updated_at và total_messages
chatSessionSchema.pre("save", function (next) {
  this.updated_at = Date.now();
  this.total_messages = this.messages.length;

  // Cập nhật last_bot_response từ tin nhắn bot cuối cùng
  const lastBotMessage = this.messages
    .slice()
    .reverse()
    .find((msg) => msg.type === "bot");

  if (lastBotMessage) {
    this.last_bot_response = {
      source: lastBotMessage.source,
      category: lastBotMessage.category,
      confidence: lastBotMessage.confidence,
    };
  }

  next();
});

// Index cho việc tìm kiếm và cleanup
chatSessionSchema.index({ created_at: 1 });
chatSessionSchema.index({ user_id: 1, created_at: -1 });
chatSessionSchema.index({ "messages.timestamp_date": -1 }); // Index mới cho sort messages

// Virtual để lấy tin nhắn cuối cùng
chatSessionSchema.virtual("last_message").get(function () {
  return this.messages.length > 0
    ? this.messages[this.messages.length - 1]
    : null;
});

// Method để thêm tin nhắn mới
chatSessionSchema.methods.addMessage = function (messageData) {
  const newMessage = {
    id: messageData.id || Date.now().toString(),
    type: messageData.type,
    content: messageData.content,
    source: messageData.source,
    category: messageData.category,
    confidence: messageData.confidence,
    total_results: messageData.total_results,
    data: messageData.data || [],
    suggestions: messageData.suggestions || [],
    timestamp:
      messageData.timestamp ||
      new Date().toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    timestamp_date: new Date(),
  };

  this.messages.push(newMessage);
  return this.save();
};

// Static method để tìm session active của user
chatSessionSchema.statics.findActiveSession = function (userId) {
  return this.findOne({
    user_id: userId,
    is_active: true,
  }).sort({ updated_at: -1 });
};

// Static method để cleanup sessions cũ
chatSessionSchema.statics.cleanupOldSessions = function (days = 30) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.updateMany(
    {
      created_at: { $lt: cutoffDate },
      is_active: true,
    },
    {
      is_active: false,
    }
  );
};

module.exports = mongoose.model("ChatSession", chatSessionSchema);
