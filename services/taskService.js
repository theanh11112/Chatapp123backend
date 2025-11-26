// src/services/taskService.js
import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

const taskService = {
  // Lấy token từ localStorage
  getAuthToken() {
    return localStorage.getItem("token");
  },

  // Tạo headers với authentication
  getAuthHeaders() {
    const token = this.getAuthToken();
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  },

  // 🆕 Tạo task mới
  async createTask(taskData) {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/tasks/create`,
        taskData,
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error creating task:", error);
      throw error;
    }
  },

  // 🆕 Lấy danh sách tasks của user
  async getUserTasks(keycloakId, filters = {}) {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/tasks/get-user-tasks`,
        {
          keycloakId,
          ...filters,
        },
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching user tasks:", error);
      throw error;
    }
  },

  // 🆕 Lấy chi tiết task
  async getTaskDetail(taskId, keycloakId) {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/tasks/get-detail`,
        {
          taskId,
          keycloakId,
        },
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching task detail:", error);
      throw error;
    }
  },

  // 🆕 Cập nhật task
  async updateTask(taskId, keycloakId, updates) {
    try {
      const response = await axios.patch(
        `${API_BASE_URL}/tasks/update`,
        {
          taskId,
          keycloakId,
          updates,
        },
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error updating task:", error);
      throw error;
    }
  },

  // 🆕 Xóa task
  async deleteTask(taskId, keycloakId) {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/tasks/delete`,
        {
          taskId,
          keycloakId,
        },
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error deleting task:", error);
      throw error;
    }
  },

  // 🆕 Lấy reminders của user
  async getUserReminders(keycloakId, page = 1, limit = 20) {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/tasks/reminders/get-user-reminders`,
        {
          keycloakId,
          page,
          limit,
        },
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching user reminders:", error);
      throw error;
    }
  },

  // 🆕 Tạo reminder mới
  async createReminder(reminderData) {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/tasks/reminder/create`,
        reminderData,
        {
          headers: this.getAuthHeaders(),
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error creating reminder:", error);
      throw error;
    }
  },
};

export default taskService;
