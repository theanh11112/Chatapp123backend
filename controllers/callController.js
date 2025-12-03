// controllers/callController.js - SOCKET.IO AUDIO VERSION
const Call = require("../models/call");
const User = require("../models/user");

// Helper functions
async function getUserByKeycloakId(keycloakId) {
  try {
    const user = await User.findOne({ keycloakId });
    if (!user) {
      throw new Error(`User with keycloakId ${keycloakId} not found`);
    }
    return user;
  } catch (error) {
    console.error(`Error fetching user ${keycloakId}:`, error);
    throw error;
  }
}

async function getUsersByKeycloakIds(keycloakIds) {
  try {
    const users = await User.find({ keycloakId: { $in: keycloakIds } });
    return users;
  } catch (error) {
    console.error(`Error fetching users ${keycloakIds}:`, error);
    throw error;
  }
}

class CallController {
  // ===========================================
  // 1. DIRECT CALLS - SOCKET.IO VERSION
  // ===========================================

  /**
   * Start direct audio call (Socket.IO version)
   */
  async startAudioCall(req, res) {
    try {
      const { to, roomID } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("🔊 [Socket.IO Audio] Starting audio call:", {
        fromKeycloakId,
        to,
        roomID,
      });

      // Validate
      if (!to || !roomID) {
        return res.status(400).json({
          success: false,
          message: "to and roomID are required",
        });
      }

      // Get user info
      const [fromUser, toUser] = await Promise.all([
        getUserByKeycloakId(fromKeycloakId),
        getUserByKeycloakId(to),
      ]);

      console.log("👤 User info:", {
        fromUser: fromUser?.username,
        toUser: toUser?.username,
        toUserSocketId: toUser?.socketId,
      });

      // Create call record - SIMPLIFIED for Socket.IO
      const call = new Call({
        roomID,
        participants: [fromKeycloakId, to],
        callType: "direct",
        status: "ringing",
        startedBy: fromKeycloakId,
        type: "audio",
        ringingStartedAt: new Date(),
        initiatedTo: to,
        callMethod: "socketio", // Đánh dấu là Socket.IO call
      });

      await call.save();
      console.log("📝 Call created (Socket.IO):", call._id);

      // Add participants
      await call.addParticipant(fromKeycloakId, "joined", {
        userName: fromUser.username || fromUser.fullName,
        avatar: fromUser.avatar,
      });

      await call.addParticipant(to, "invited", {
        userName: toUser.username || toUser.fullName,
        avatar: toUser.avatar,
      });

      // Gửi notification qua Socket.IO
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        console.log("📡 Socket instance available");

        // Tạo notification data
        const notificationData = {
          callId: call._id,
          from: fromKeycloakId,
          fromUser: {
            keycloakId: fromUser.keycloakId,
            username: fromUser.username,
            avatar: fromUser.avatar,
            fullName: fromUser.fullName,
          },
          to: to,
          roomID: roomID,
          type: "audio",
          timestamp: new Date(),
          callMethod: "socketio",
        };

        console.log(
          "📤 Emitting audio_call_notification to:",
          to,
          fromKeycloakId,
          socketInstance
        );

        // Gửi đến người nhận
        socketInstance.to(to).emit("audio_call_notification", notificationData);

        // Gửi confirmation đến người gọi
        socketInstance.to(fromKeycloakId).emit("audio_call_initiated", {
          callId: call._id,
          to: to,
          toUser: {
            keycloakId: toUser.keycloakId,
            username: toUser.username,
            avatar: toUser.avatar,
          },
          roomID: roomID,
          timestamp: new Date(),
          callMethod: "socketio",
        });

        console.log("✅ Notifications sent successfully");
      } else {
        console.warn("⚠️ Socket instance not available");
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        toUser: {
          keycloakId: to,
          name: toUser.fullName || toUser.username,
          avatar: toUser.avatar,
        },
        callMethod: "socketio",
        message: "Audio call initiated successfully using Socket.IO",
      });
    } catch (error) {
      console.error("❌ Start audio call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start audio call",
      });
    }
  }

  /**
   * Start direct video call (Socket.IO version)
   */
  async startVideoCall(req, res) {
    try {
      const { to, roomID } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("🎥 [Socket.IO Video] Starting video call:", {
        fromKeycloakId,
        to,
        roomID,
      });

      // Validate
      if (!to || !roomID) {
        return res.status(400).json({
          success: false,
          message: "to and roomID are required",
        });
      }

      // Get user info
      const [fromUser, toUser] = await Promise.all([
        getUserByKeycloakId(fromKeycloakId),
        getUserByKeycloakId(to),
      ]);

      // Create call record - SIMPLIFIED for Socket.IO
      const call = new Call({
        roomID,
        participants: [fromKeycloakId, to],
        callType: "direct",
        status: "ringing",
        startedBy: fromKeycloakId,
        type: "video",
        ringingStartedAt: new Date(),
        initiatedTo: to,
        callMethod: "socketio",
      });

      await call.save();

      // Add participants
      await call.addParticipant(fromKeycloakId, "joined", {
        userName: fromUser.username || fromUser.fullName,
        avatar: fromUser.avatar,
      });

      await call.addParticipant(to, "invited", {
        userName: toUser.username || toUser.fullName,
        avatar: toUser.avatar,
      });

      // Emit socket event
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        const notificationData = {
          callId: call._id,
          from: fromKeycloakId,
          fromUser: {
            keycloakId: fromUser.keycloakId,
            username: fromUser.username,
            avatar: fromUser.avatar,
            fullName: fromUser.fullName,
          },
          to: to,
          roomID: roomID,
          type: "video",
          timestamp: new Date(),
          callMethod: "socketio",
        };

        socketInstance.to(to).emit("video_call_notification", notificationData);

        // Notify sender
        socketInstance.to(fromKeycloakId).emit("video_call_initiated", {
          ...notificationData,
          toUser: {
            keycloakId: to,
            name: toUser.fullName || toUser.username,
            avatar: toUser.avatar,
          },
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        toUser: {
          keycloakId: to,
          name: toUser.fullName || toUser.username,
          avatar: toUser.avatar,
        },
        callMethod: "socketio",
        message: "Video call initiated successfully using Socket.IO",
      });
    } catch (error) {
      console.error("❌ Start video call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start video call",
      });
    }
  }

  // ===========================================
  // 2. GROUP CALLS - SOCKET.IO VERSION
  // ===========================================

  /**
   * Start group audio call (Socket.IO version)
   */
  async startGroupAudioCall(req, res) {
    try {
      const { participants, roomID, callTitle } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("👥 [Socket.IO Group Audio] Starting group audio call:", {
        fromKeycloakId,
        participants,
        roomID,
      });

      // Validate
      if (!participants || !Array.isArray(participants) || !roomID) {
        return res.status(400).json({
          success: false,
          message: "participants array and roomID are required",
        });
      }

      // Get all users info
      const allKeycloakIds = [...new Set([...participants, fromKeycloakId])];
      const users = await getUsersByKeycloakIds(allKeycloakIds);

      const fromUser = users.find((u) => u.keycloakId === fromKeycloakId);
      const participantUsers = users.filter(
        (u) => u.keycloakId !== fromKeycloakId
      );

      // Create call record - SIMPLIFIED
      const call = new Call({
        roomID,
        participants: allKeycloakIds,
        callType: "group",
        status: "ringing",
        startedBy: fromKeycloakId,
        type: "audio",
        callTitle:
          callTitle || `Group Audio Call (${allKeycloakIds.length} people)`,
        ringingStartedAt: new Date(),
        maxParticipants: allKeycloakIds.length,
        callMethod: "socketio",
      });

      await call.save();

      // Add all participants
      await call.addParticipant(fromKeycloakId, "joined", {
        userName: fromUser.username || fromUser.fullName,
        avatar: fromUser.avatar,
      });

      for (const user of participantUsers) {
        await call.addParticipant(user.keycloakId, "invited", {
          userName: user.username || user.fullName,
          avatar: user.avatar,
        });
      }

      // Notify all participants via Socket.IO
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        const notificationData = {
          callId: call._id,
          roomID,
          from: fromKeycloakId,
          fromUser: {
            keycloakId: fromUser.keycloakId,
            username: fromUser.username,
            avatar: fromUser.avatar,
            fullName: fromUser.fullName,
          },
          type: "audio",
          callType: "group",
          participants: allKeycloakIds.map((id) => ({
            id,
            status: id === fromKeycloakId ? "joined" : "invited",
            name: users.find((u) => u.keycloakId === id)?.username || "User",
          })),
          timestamp: new Date(),
          callTitle: call.callTitle,
          participantCount: allKeycloakIds.length,
          callMethod: "socketio",
        };

        // Notify each participant
        participants.forEach((participantKeycloakId) => {
          if (participantKeycloakId !== fromKeycloakId) {
            socketInstance
              .to(participantKeycloakId)
              .emit("audio_call_notification", notificationData);
          }
        });

        // Notify sender
        socketInstance.to(fromKeycloakId).emit("group_call_initiated", {
          ...notificationData,
          message: "Group call initiated successfully",
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        participants: allKeycloakIds,
        callTitle: call.callTitle,
        participantCount: allKeycloakIds.length,
        callMethod: "socketio",
        message: "Group audio call initiated successfully using Socket.IO",
      });
    } catch (error) {
      console.error("❌ Start group audio call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start group audio call",
      });
    }
  }

  /**
   * Start group video call (Socket.IO version)
   */
  async startGroupVideoCall(req, res) {
    try {
      const { participants, roomID, callTitle } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("👥🎥 [Socket.IO Group Video] Starting group video call:", {
        fromKeycloakId,
        participants,
        roomID,
      });

      // Validate
      if (!participants || !Array.isArray(participants) || !roomID) {
        return res.status(400).json({
          success: false,
          message: "participants array and roomID are required",
        });
      }

      // Get all users info
      const allKeycloakIds = [...new Set([...participants, fromKeycloakId])];
      const users = await getUsersByKeycloakIds(allKeycloakIds);

      const fromUser = users.find((u) => u.keycloakId === fromKeycloakId);
      const participantUsers = users.filter(
        (u) => u.keycloakId !== fromKeycloakId
      );

      // Create call record - SIMPLIFIED
      const call = new Call({
        roomID,
        participants: allKeycloakIds,
        callType: "group",
        status: "ringing",
        startedBy: fromKeycloakId,
        type: "video",
        callTitle:
          callTitle || `Group Video Call (${allKeycloakIds.length} people)`,
        ringingStartedAt: new Date(),
        maxParticipants: allKeycloakIds.length,
        callMethod: "socketio",
      });

      await call.save();

      // Add all participants
      await call.addParticipant(fromKeycloakId, "joined", {
        userName: fromUser.username || fromUser.fullName,
        avatar: fromUser.avatar,
      });

      for (const user of participantUsers) {
        await call.addParticipant(user.keycloakId, "invited", {
          userName: user.username || user.fullName,
          avatar: user.avatar,
        });
      }

      // Notify all participants via Socket.IO
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        const notificationData = {
          callId: call._id,
          roomID,
          from: fromKeycloakId,
          fromUser: {
            keycloakId: fromUser.keycloakId,
            username: fromUser.username,
            avatar: fromUser.avatar,
            fullName: fromUser.fullName,
          },
          type: "video",
          callType: "group",
          participants: allKeycloakIds.map((id) => ({
            id,
            status: id === fromKeycloakId ? "joined" : "invited",
            name: users.find((u) => u.keycloakId === id)?.username || "User",
          })),
          timestamp: new Date(),
          callTitle: call.callTitle,
          participantCount: allKeycloakIds.length,
          callMethod: "socketio",
        };

        // Notify each participant
        participants.forEach((participantKeycloakId) => {
          if (participantKeycloakId !== fromKeycloakId) {
            socketInstance
              .to(participantKeycloakId)
              .emit("video_call_notification", notificationData);
          }
        });

        // Notify sender
        socketInstance.to(fromKeycloakId).emit("group_call_initiated", {
          ...notificationData,
          message: "Group video call initiated successfully",
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        participants: allKeycloakIds,
        callTitle: call.callTitle,
        participantCount: allKeycloakIds.length,
        callMethod: "socketio",
        message: "Group video call initiated successfully using Socket.IO",
      });
    } catch (error) {
      console.error("❌ Start group video call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start group video call",
      });
    }
  }

  // ===========================================
  // 3. CALL MANAGEMENT
  // ===========================================

  /**
   * Update call status (accept, decline, etc.)
   */
  async updateCallStatus(req, res) {
    try {
      const { callId, status } = req.body;
      const userKeycloakId = req.user.keycloakId;

      console.log("🔄 Updating call status (Socket.IO):", {
        callId,
        userKeycloakId,
        status,
      });

      if (!callId || !status) {
        return res.status(400).json({
          success: false,
          message: "callId and status are required",
        });
      }

      // Get user info
      const user = await getUserByKeycloakId(userKeycloakId);

      // Find call
      const call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      // Check if user is a participant
      if (!call.participants.includes(userKeycloakId)) {
        return res.status(403).json({
          success: false,
          message: "You are not a participant of this call",
        });
      }

      let updateData = {};
      let socketEvent = "call_status_updated";
      let updateAllParticipants = false;

      switch (status) {
        case "accepted":
          updateData.status = "ongoing";
          updateData.answeredAt = new Date();

          // Update status cho CẢ HAI participants
          await call.updateParticipantStatus(userKeycloakId, "joined");

          // Tìm tất cả participants có status "invited" và update thành "joined"
          for (const participantId of call.participants) {
            const participant = call.participantDetails.find(
              (p) => p.userId === participantId
            );
            if (participant && participant.status === "invited") {
              await call.updateParticipantStatus(participantId, "joined");
            }
          }

          // Tính ringing duration
          if (call.ringingStartedAt) {
            updateData.ringingDuration = Math.floor(
              (new Date() - new Date(call.ringingStartedAt)) / 1000
            );
            updateData.ringingEndedAt = new Date();
          }

          socketEvent = "call_accepted";
          break;
        case "declined":
          updateData.status = "declined";
          updateData.endedAt = new Date();
          await call.updateParticipantStatus(userKeycloakId, "declined");

          // Người gọi cũng bị declined
          if (call.startedBy && call.startedBy !== userKeycloakId) {
            await call.updateParticipantStatus(call.startedBy, "declined");
          }

          socketEvent = "call_declined";
          break;

        case "missed":
          updateData.status = "missed";
          updateData.endedAt = new Date();
          await call.updateParticipantStatus(userKeycloakId, "missed");

          // Người gọi cũng bị missed
          if (call.startedBy && call.startedBy !== userKeycloakId) {
            await call.updateParticipantStatus(call.startedBy, "missed");
          }

          socketEvent = "call_missed";
          break;

        case "ongoing":
          updateData.status = "ongoing";
          await call.updateParticipantStatus(userKeycloakId, "joined");
          break;

        case "cancelled":
          updateData.status = "cancelled";
          updateData.endedAt = new Date();
          await call.updateParticipantStatus(userKeycloakId, "cancelled");

          // Tất cả participants đều cancelled
          updateAllParticipants = true;
          socketEvent = "call_cancelled";
          break;

        default:
          return res.status(400).json({
            success: false,
            message:
              "Invalid status. Allowed: accepted, declined, missed, ongoing, cancelled",
          });
      }

      // Nếu cần update tất cả participants (cho cancelled)
      if (updateAllParticipants) {
        for (const participantId of call.participants) {
          if (participantId !== userKeycloakId) {
            await call.updateParticipantStatus(participantId, "cancelled");
          }
        }
      }

      // Update call
      Object.assign(call, updateData);
      await call.save();

      // Emit socket events
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        const eventData = {
          callId,
          call,
          status: call.status,
          updatedBy: userKeycloakId,
          userName: user.username || user.fullName,
          timestamp: new Date().toISOString(),
          callMethod: call.callMethod || "socketio",
        };

        // Emit to room
        socketInstance.to(call.roomID).emit(socketEvent, eventData);

        // Emit general status update
        socketInstance.to(call.roomID).emit("call_status_updated", eventData);

        // Type-specific events
        if (call.type === "audio") {
          socketInstance
            .to(call.roomID)
            .emit("audio_call_status_updated", eventData);
        } else if (call.type === "video") {
          socketInstance
            .to(call.roomID)
            .emit("video_call_status_updated", eventData);
        }

        // Notify all participants individually
        call.participants.forEach((participantId) => {
          if (participantId !== userKeycloakId) {
            socketInstance.to(participantId).emit("call_status_notification", {
              ...eventData,
              targetUserId: participantId,
            });
          }
        });
      }

      res.json({
        success: true,
        callId: call._id,
        status: call.status,
        callMethod: call.callMethod,
        message: `Call ${status} successfully`,
      });
    } catch (error) {
      console.error("❌ Update call status failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update call status",
      });
    }
  }

  /**
   * End call
   */
  async endCall(req, res) {
    try {
      const { callId, duration = 0 } = req.body;
      const endedByKeycloakId = req.user.keycloakId;

      console.log("📴 Ending call (Socket.IO):", {
        callId,
        endedByKeycloakId,
        duration,
      });

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: "callId is required",
        });
      }

      // Get user info
      const endedByUser = await getUserByKeycloakId(endedByKeycloakId);

      // Find call
      const call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      // End the call
      await call.endCall(endedByKeycloakId, duration);

      // Notify participants
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        const eventData = {
          callId,
          call,
          roomID: call.roomID,
          endedBy: endedByKeycloakId,
          endedByName: endedByUser.username || endedByUser.fullName,
          duration: call.duration,
          endedAt: call.endedAt,
          timestamp: new Date().toISOString(),
          callMethod: call.callMethod || "socketio",
        };

        // Emit to room
        socketInstance.to(call.roomID).emit("call_ended", eventData);

        // Type-specific events
        if (call.type === "audio") {
          socketInstance.to(call.roomID).emit("audio_call_ended", eventData);
        } else if (call.type === "video") {
          socketInstance.to(call.roomID).emit("video_call_ended", eventData);
        }

        // Notify each participant individually
        call.participants.forEach((participantId) => {
          socketInstance.to(participantId).emit("call_ended_notification", {
            ...eventData,
            targetUserId: participantId,
          });
        });
      }

      res.json({
        success: true,
        callId: call._id,
        duration: call.duration,
        endedAt: call.endedAt,
        endedBy: endedByKeycloakId,
        callMethod: call.callMethod,
        message: "Call ended successfully",
      });
    } catch (error) {
      console.error("❌ End call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to end call",
      });
    }
  }

  // ===========================================
  // 4. CALL QUERIES
  // ===========================================

  /**
   * Get user's call logs
   */
  async getCallLogs(req, res) {
    try {
      const {
        limit = 50,
        skip = 0,
        callType,
        status,
        type,
        userId,
        callMethod = "socketio", // Mặc định là Socket.IO
      } = req.body;

      // Dùng userId từ body hoặc từ auth token
      const userKeycloakId = userId || req.user?.keycloakId;

      if (!userKeycloakId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required",
        });
      }

      console.log("📋 Fetching call logs for user (Socket.IO):", {
        userKeycloakId,
        limit,
        skip,
        callType,
        status,
        type,
        callMethod,
      });

      // Build query
      const query = { participants: userKeycloakId };

      if (callType) query.callType = callType;
      if (status) query.status = status;
      if (type) query.type = type;
      if (callMethod) query.callMethod = callMethod;

      // Xử lý thủ công không dùng populate
      const calls = await Call.find(query)
        .sort({ startedAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean();

      console.log(`✅ Found ${calls.length} calls for user: ${userKeycloakId}`);

      // Nếu không có calls, trả về luôn
      if (calls.length === 0) {
        return res.json({
          success: true,
          calls: [],
          total: 0,
          page: Math.floor(skip / limit) + 1,
          totalPages: 1,
          hasMore: false,
        });
      }

      // Xử lý thủ công thay vì populate
      const allParticipantIds = new Set();
      calls.forEach((call) => {
        call.participants.forEach((id) => allParticipantIds.add(id));
        allParticipantIds.add(call.startedBy);
        if (call.endedBy) allParticipantIds.add(call.endedBy);
      });

      // Lấy thông tin users
      const User = require("../models/user");
      const users = await User.find(
        { keycloakId: { $in: Array.from(allParticipantIds) } },
        "keycloakId username firstName lastName avatar email status"
      ).lean();

      // Tạo map cho nhanh
      const userMap = {};
      users.forEach((user) => {
        userMap[user.keycloakId] = {
          username: user.username,
          fullName:
            user.fullName || `${user.firstName} ${user.lastName}`.trim(),
          avatar: user.avatar,
          email: user.email,
          status: user.status,
        };
      });

      // Format response
      const formattedCalls = calls.map((call) => {
        // Xử lý participantDetails
        const participantDetails = (call.participantDetails || []).map(
          (detail) => {
            const userInfo = userMap[detail.userId] || null;
            return {
              ...detail,
              userInfo: userInfo
                ? {
                    username: userInfo.username,
                    fullName: userInfo.fullName,
                    avatar: userInfo.avatar,
                    status: userInfo.status,
                  }
                : null,
            };
          }
        );

        const startedByInfo = userMap[call.startedBy] || null;
        const endedByInfo = call.endedBy ? userMap[call.endedBy] || null : null;

        return {
          _id: call._id,
          roomID: call.roomID,
          callType: call.callType,
          type: call.type,
          status: call.status,
          duration: call.duration || 0,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          ringingDuration: call.ringingDuration || 0,
          participants: call.participants || [],
          participantDetails,
          startedBy: call.startedBy,
          startedByInfo,
          endedBy: call.endedBy,
          endedByInfo,
          callTitle: call.callTitle || null,
          callMethod: call.callMethod || "socketio",
          isIncoming: call.startedBy !== userKeycloakId,
          createdAt: call.createdAt,
          updatedAt: call.updatedAt,
          participantCount: call.participants?.length || 0,
        };
      });

      // Get total count
      const totalCount = await Call.countDocuments(query);

      res.json({
        success: true,
        calls: formattedCalls,
        total: totalCount,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + limit < totalCount,
        callMethod: "socketio",
      });
    } catch (error) {
      console.error("❌ Get call logs failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch call logs",
      });
    }
  }

  /**
   * Get call details
   */
  async getCallDetails(req, res) {
    try {
      const { callId } = req.body;

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: "callId is required",
        });
      }

      const call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      // Get user info for all participants
      const users = await getUsersByKeycloakIds(call.participants);
      const userMap = users.reduce((map, user) => {
        map[user.keycloakId] = user;
        return map;
      }, {});

      // Format response with user info
      const formattedCall = {
        ...call.toObject(),
        participantDetails: call.participantDetails.map((detail) => ({
          ...detail.toObject(),
          userInfo: userMap[detail.userId]
            ? {
                username: userMap[detail.userId].username,
                fullName: userMap[detail.userId].fullName,
                avatar: userMap[detail.userId].avatar,
                status: userMap[detail.userId].status,
                email: userMap[detail.userId].email,
              }
            : null,
        })),
        startedByInfo: userMap[call.startedBy]
          ? {
              username: userMap[call.startedBy].username,
              fullName: userMap[call.startedBy].fullName,
              avatar: userMap[call.startedBy].avatar,
            }
          : null,
        endedByInfo:
          call.endedBy && userMap[call.endedBy]
            ? {
                username: userMap[call.endedBy].username,
                fullName: userMap[call.endedBy].fullName,
                avatar: userMap[call.endedBy].avatar,
              }
            : null,
      };

      res.json({
        success: true,
        call: formattedCall,
        callMethod: call.callMethod || "socketio",
      });
    } catch (error) {
      console.error("❌ Get call details failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch call details",
      });
    }
  }

  /**
   * Get ongoing calls for user
   */
  async getOngoingCalls(req, res) {
    try {
      const userKeycloakId = req.user.keycloakId;

      const ongoingCalls = await Call.find({
        participants: userKeycloakId,
        status: { $in: ["ringing", "ongoing"] },
        callMethod: "socketio", // Chỉ lấy Socket.IO calls
      }).sort({ startedAt: -1 });

      res.json({
        success: true,
        ongoingCalls,
        total: ongoingCalls.length,
        callMethod: "socketio",
      });
    } catch (error) {
      console.error("❌ Get ongoing calls failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch ongoing calls",
      });
    }
  }

  /**
   * Get call statistics
   */
  async getCallStatistics(req, res) {
    try {
      const userKeycloakId = req.user.keycloakId;

      // Get statistics using aggregation
      const stats = await Call.aggregate([
        { $match: { participants: userKeycloakId, callMethod: "socketio" } },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            completedCalls: {
              $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
            },
            missedCalls: {
              $sum: { $cond: [{ $eq: ["$status", "missed"] }, 1, 0] },
            },
            declinedCalls: {
              $sum: { $cond: [{ $eq: ["$status", "declined"] }, 1, 0] },
            },
            totalDuration: { $sum: "$duration" },
            audioCalls: {
              $sum: { $cond: [{ $eq: ["$type", "audio"] }, 1, 0] },
            },
            videoCalls: {
              $sum: { $cond: [{ $eq: ["$type", "video"] }, 1, 0] },
            },
            directCalls: {
              $sum: { $cond: [{ $eq: ["$callType", "direct"] }, 1, 0] },
            },
            groupCalls: {
              $sum: { $cond: [{ $eq: ["$callType", "group"] }, 1, 0] },
            },
          },
        },
      ]);

      const result = stats[0] || {
        totalCalls: 0,
        completedCalls: 0,
        missedCalls: 0,
        declinedCalls: 0,
        totalDuration: 0,
        audioCalls: 0,
        videoCalls: 0,
        directCalls: 0,
        groupCalls: 0,
      };

      // Calculate additional metrics
      const completionRate =
        result.totalCalls > 0
          ? ((result.completedCalls / result.totalCalls) * 100).toFixed(2)
          : 0;

      const avgDuration =
        result.completedCalls > 0
          ? (result.totalDuration / result.completedCalls).toFixed(2)
          : 0;

      res.json({
        success: true,
        statistics: {
          ...result,
          completionRate: parseFloat(completionRate),
          avgDuration: parseFloat(avgDuration),
          missedRate:
            result.totalCalls > 0
              ? ((result.missedCalls / result.totalCalls) * 100).toFixed(2)
              : 0,
          declinedRate:
            result.totalCalls > 0
              ? ((result.declinedCalls / result.totalCalls) * 100).toFixed(2)
              : 0,
        },
        callMethod: "socketio",
        note: "Statistics for Socket.IO calls only",
      });
    } catch (error) {
      console.error("❌ Get call statistics failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch call statistics",
      });
    }
  }

  /**
   * Join existing call (Socket.IO version)
   */
  async joinCall(req, res) {
    try {
      const { callId, streamID } = req.body;
      const userKeycloakId = req.user.keycloakId;

      console.log("🚪 Joining call (Socket.IO):", {
        callId,
        userKeycloakId,
        streamID,
      });

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: "callId is required",
        });
      }

      // Get user info
      const user = await getUserByKeycloakId(userKeycloakId);

      // Find call
      const call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      // Check if user is a participant
      if (!call.participants.includes(userKeycloakId)) {
        return res.status(403).json({
          success: false,
          message: "You are not invited to this call",
        });
      }

      // Update participant status
      await call.updateParticipantStatus(userKeycloakId, "joined");

      // Update stream info if provided
      if (streamID) {
        await call.updateParticipantStream(userKeycloakId, streamID);
      }

      // Emit socket event
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        socketInstance.to(call.roomID).emit("user_joined_call", {
          callId,
          userId: userKeycloakId,
          userName: user.username || user.fullName,
          userAvatar: user.avatar,
          streamID: streamID || `stream-${call.roomID}-${userKeycloakId}`,
          timestamp: new Date().toISOString(),
          callMethod: "socketio",
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID: call.roomID,
        callMethod: call.callMethod || "socketio",
        message: "Joined call successfully via Socket.IO",
      });
    } catch (error) {
      console.error("❌ Join call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to join call",
      });
    }
  }

  /**
   * Leave call (Socket.IO version)
   */
  async leaveCall(req, res) {
    try {
      const { callId } = req.body;
      const userKeycloakId = req.user.keycloakId;

      console.log("🚶 Leaving call (Socket.IO):", { callId, userKeycloakId });

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: "callId is required",
        });
      }

      // Get user info
      const user = await getUserByKeycloakId(userKeycloakId);

      // Find call
      const call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      // Update participant status
      await call.updateParticipantStatus(userKeycloakId, "left");

      // End participant stream
      await call.endParticipantStream(userKeycloakId);

      // Check if call should be ended (no more participants)
      const activeParticipants = call.participantDetails.filter(
        (p) => p.status === "joined"
      ).length;

      let callEnded = false;
      if (activeParticipants === 0) {
        await call.endCall(userKeycloakId);
        callEnded = true;
      }

      // Emit socket event
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        socketInstance.to(call.roomID).emit("user_left_call", {
          callId,
          userId: userKeycloakId,
          userName: user.username || user.fullName,
          timestamp: new Date().toISOString(),
          callEnded,
          callMethod: "socketio",
        });

        if (callEnded) {
          socketInstance.to(call.roomID).emit("call_ended", {
            callId,
            roomID: call.roomID,
            endedBy: userKeycloakId,
            duration: call.duration,
            endedAt: call.endedAt,
            callMethod: "socketio",
          });
        }
      }

      res.json({
        success: true,
        callId: call._id,
        leftAt: new Date().toISOString(),
        callEnded,
        callMethod: call.callMethod || "socketio",
        message: callEnded
          ? "Call ended as all participants left"
          : "Left call successfully",
      });
    } catch (error) {
      console.error("❌ Leave call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to leave call",
      });
    }
  }

  // ===========================================
  // 5. CLEANUP & MAINTENANCE
  // ===========================================

  /**
   * Clean up old ringing calls
   */
  async cleanupOldCalls(req, res) {
    try {
      console.log("🧹 Cleaning up old ringing calls (Socket.IO)...");

      const cleanupResult = await Call.cleanupOldRingingCalls();

      res.json({
        success: true,
        message: "Call cleanup completed successfully",
        result: {
          modifiedCount: cleanupResult.modifiedCount || 0,
          matchedCount: cleanupResult.matchedCount || 0,
          acknowledged: cleanupResult.acknowledged || false,
        },
        timestamp: new Date().toISOString(),
        note: "Socket.IO calls cleanup",
      });
    } catch (error) {
      console.error("❌ Cleanup failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to cleanup old calls",
      });
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(req, res) {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

      // Count calls that need cleanup
      const [totalRinging, oldRinging] = await Promise.all([
        Call.countDocuments({ status: "ringing", callMethod: "socketio" }),
        Call.countDocuments({
          status: "ringing",
          ringingStartedAt: { $lt: oneMinuteAgo },
          callMethod: "socketio",
        }),
      ]);

      res.json({
        success: true,
        stats: {
          totalRingingCalls: totalRinging,
          oldRingingCalls: oldRinging, // > 1 minute
          cleanupNeeded: oldRinging > 0,
          lastChecked: now.toISOString(),
          recommendation:
            oldRinging > 0
              ? `Run cleanup to mark ${oldRinging} Socket.IO calls as missed`
              : "No cleanup needed",
        },
        callMethod: "socketio",
      });
    } catch (error) {
      console.error("❌ Get cleanup stats failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get cleanup stats",
      });
    }
  }
}

module.exports = new CallController();
