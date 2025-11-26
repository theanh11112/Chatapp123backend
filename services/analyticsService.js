// src/services/analyticsService.js
import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

const analyticsService = {
  getAuthHeaders() {
    const token = localStorage.getItem("token");
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  },

  // 🆕 Lấy system stats
  async getSystemStats() {
    try {
      // Tạm thời tính toán từ tasks và users
      const tasksResponse = await axios.get(`${API_BASE_URL}/tasks/stats`, {
        headers: this.getAuthHeaders(),
      });

      const usersResponse = await axios.get(`${API_BASE_URL}/users/stats`, {
        headers: this.getAuthHeaders(),
      });

      return {
        totalUsers: usersResponse.data.totalUsers || 0,
        onlineUsers: usersResponse.data.onlineUsers || 0,
        totalTasks: tasksResponse.data.totalTasks || 0,
        completedTasks: tasksResponse.data.completedTasks || 0,
        systemLoad: 45, // Mock - có thể lấy từ server monitoring
        responseTime: 120, // Mock - có thể lấy từ server monitoring
      };
    } catch (error) {
      console.error("Error fetching system stats:", error);
      // Fallback data
      return {
        totalUsers: 0,
        onlineUsers: 0,
        totalTasks: 0,
        completedTasks: 0,
        systemLoad: 0,
        responseTime: 0,
      };
    }
  },

  // 🆕 Lấy user activity data
  async getUserActivityData() {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/analytics/user-activity`,
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching user activity data:", error);
      // Mock data fallback
      return [
        { name: "T2", messages: 1200, tasks: 45, online: 89 },
        { name: "T3", messages: 1900, tasks: 52, online: 92 },
        { name: "T4", messages: 1500, tasks: 38, online: 87 },
        { name: "T5", messages: 2200, tasks: 61, online: 94 },
        { name: "T6", messages: 1800, tasks: 49, online: 91 },
        { name: "T7", messages: 2500, tasks: 67, online: 96 },
        { name: "CN", messages: 2100, tasks: 58, online: 93 },
      ];
    }
  },

  // 🆕 Lấy task status distribution
  async getTaskStatusDistribution() {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/analytics/task-status`,
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching task status distribution:", error);
      // Mock data fallback
      return [
        { name: "Chưa làm", value: 25, color: "#ff6b6b" },
        { name: "Đang làm", value: 40, color: "#4ecdc4" },
        { name: "Chờ duyệt", value: 15, color: "#45b7d1" },
        { name: "Hoàn thành", value: 20, color: "#96ceb4" },
      ];
    }
  },
};

export default analyticsService;
