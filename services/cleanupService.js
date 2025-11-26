// services/cleanupService.js
const ChatSession = require("../models/ChatSession");

class CleanupService {
  constructor() {
    this.cleanupInterval = 24 * 60 * 60 * 1000; // 24 giờ
  }

  // Cleanup sessions cũ (hơn 30 ngày)
  async cleanupOldSessions() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await ChatSession.updateMany(
        {
          created_at: { $lt: thirtyDaysAgo },
          is_active: true,
        },
        {
          is_active: false,
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ Đã deactivate ${result.modifiedCount} sessions cũ`);
      }

      return result;
    } catch (error) {
      console.error("❌ Lỗi cleanup sessions:", error);
      throw error;
    }
  }

  // Cleanup sessions không có tin nhắn (sau 7 ngày)
  async cleanupEmptySessions() {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const result = await ChatSession.deleteMany({
        created_at: { $lt: sevenDaysAgo },
        $or: [{ messages: { $size: 0 } }, { messages: { $exists: false } }],
      });

      if (result.deletedCount > 0) {
        console.log(`✅ Đã xóa ${result.deletedCount} empty sessions`);
      }

      return result;
    } catch (error) {
      console.error("❌ Lỗi cleanup empty sessions:", error);
      throw error;
    }
  }

  // Tự động chạy cleanup định kỳ
  startAutoCleanup() {
    setInterval(async () => {
      try {
        await this.cleanupOldSessions();
        await this.cleanupEmptySessions();
      } catch (error) {
        console.error("❌ Lỗi auto cleanup:", error);
      }
    }, this.cleanupInterval);

    console.log("🚀 Auto cleanup service started");
  }
}

module.exports = new CleanupService();
