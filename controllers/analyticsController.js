// controllers/analyticsController.js
const User = require("../models/user");
const Task = require("../models/Task");
const Message = require("../models/message");
const Room = require("../models/room");
const Notification = require("../models/Notification");

const analyticsController = {
  // 📊 Lấy thống kê hệ thống
  async getSystemStats(req, res) {
    try {
      console.log("📊 Fetching system stats...");

      // Lấy tổng số users
      const totalUsers = await User.countDocuments();

      // Lấy số users online (giả định dựa trên lastSeen trong 5 phút)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const onlineUsers = await User.countDocuments({
        lastSeen: { $gte: fiveMinutesAgo },
      });

      // Lấy thống kê tasks
      const totalTasks = await Task.countDocuments();
      const completedTasks = await Task.countDocuments({ status: "done" });

      // Tính hiệu suất hệ thống (giả lập)
      const systemLoad = Math.floor(Math.random() * 30) + 60; // 60-90%
      const responseTime = Math.floor(Math.random() * 50) + 80; // 80-130ms

      const stats = {
        totalUsers,
        onlineUsers,
        totalTasks,
        completedTasks,
        systemLoad,
        responseTime,
        updatedAt: new Date().toISOString(),
      };

      console.log("✅ System stats fetched:", stats);

      res.status(200).json(stats);
    } catch (error) {
      console.error("❌ Error fetching system stats:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch system stats",
      });
    }
  },

  // 📈 Lấy dữ liệu hoạt động hệ thống (7 ngày)
  async getUserActivity(req, res) {
    try {
      console.log("📈 Fetching user activity data...");

      // Tạo dữ liệu 7 ngày gần nhất
      const days = 7;
      const activityData = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        const dayName = date.toLocaleDateString("vi-VN", { weekday: "short" });

        // Giả lập dữ liệu dựa trên ngày
        const baseMessages = Math.floor(Math.random() * 20) + 30;
        const baseTasks = Math.floor(Math.random() * 8) + 10;
        const baseOnline = Math.floor(Math.random() * 10) + 15;

        // Tăng giảm theo ngày trong tuần
        const dayMultiplier = i === 5 || i === 6 ? 0.7 : 1; // Cuối tuần ít hoạt động hơn

        activityData.push({
          name: dayName,
          messages: Math.floor(baseMessages * dayMultiplier),
          tasks: Math.floor(baseTasks * dayMultiplier),
          online: Math.floor(baseOnline * dayMultiplier),
        });
      }

      console.log("✅ User activity data generated");

      res.status(200).json(activityData);
    } catch (error) {
      console.error("❌ Error fetching user activity:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch user activity data",
      });
    }
  },

  // 📊 Lấy phân bổ trạng thái task
  async getTaskDistribution(req, res) {
    try {
      console.log("📊 Fetching task distribution...");

      // Đếm tasks theo trạng thái
      const todoCount = await Task.countDocuments({ status: "todo" });
      const inProgressCount = await Task.countDocuments({
        status: "in_progress",
      });
      const reviewCount = await Task.countDocuments({ status: "review" });
      const doneCount = await Task.countDocuments({ status: "done" });

      const distribution = [
        { name: "Chưa làm", value: todoCount, color: "#ff6b6b" },
        { name: "Đang làm", value: inProgressCount, color: "#4ecdc4" },
        { name: "Chờ duyệt", value: reviewCount, color: "#45b7d1" },
        { name: "Hoàn thành", value: doneCount, color: "#96ceb4" },
      ];

      console.log("✅ Task distribution fetched:", distribution);

      res.status(200).json(distribution);
    } catch (error) {
      console.error("❌ Error fetching task distribution:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch task distribution",
      });
    }
  },

  // ⚡ Lấy hiệu suất hệ thống
  async getSystemPerformance(req, res) {
    try {
      console.log("⚡ Fetching system performance...");

      // Giả lập dữ liệu hiệu suất
      const performance = {
        cpuUsage: Math.floor(Math.random() * 40) + 40, // 40-80%
        memoryUsage: Math.floor(Math.random() * 35) + 50, // 50-85%
        diskUsage: Math.floor(Math.random() * 30) + 45, // 45-75%
        networkLatency: Math.floor(Math.random() * 20) + 70, // 70-90ms
        uptime: Math.floor(Math.random() * 100) + 700, // 700-800 hours
        updatedAt: new Date().toISOString(),
      };

      console.log("✅ System performance fetched");

      res.status(200).json(performance);
    } catch (error) {
      console.error("❌ Error fetching system performance:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch system performance",
      });
    }
  },

  // 📈 Lấy thống kê sử dụng
  async getUsageStats(req, res) {
    try {
      const { days = 30 } = req.body;
      console.log(`📈 Fetching usage stats for ${days} days...`);

      // Tính ngày bắt đầu
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Lấy thống kê messages
      const messagesStats = await Message.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      // Lấy thống kê users mới
      const newUsersStats = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      const stats = {
        period: `${days} days`,
        messages: messagesStats,
        newUsers: newUsersStats,
        totalMessages: messagesStats.reduce((sum, day) => sum + day.count, 0),
        totalNewUsers: newUsersStats.reduce((sum, day) => sum + day.count, 0),
      };

      console.log("✅ Usage stats fetched");

      res.status(200).json(stats);
    } catch (error) {
      console.error("❌ Error fetching usage stats:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to fetch usage stats",
      });
    }
  },
};

module.exports = analyticsController;
