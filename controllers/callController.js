// controllers/callController.js - COMPLETE FIXED VERSION
const Call = require("../models/call");
const zegoService = require("../services/zegoService");

// Helper functions
async function getUserByKeycloakId(keycloakId) {
  const user = await User.findOne({ keycloakId });
  if (!user) {
    throw new Error(`User with keycloakId ${keycloakId} not found`);
  }
  return user;
}

async function getUsersByKeycloakIds(keycloakIds) {
  const users = await User.find({ keycloakId: { $in: keycloakIds } });
  return users;
}

class CallController {
  // Generate Zego token - API endpoint
  async generateZegoToken(req, res) {
    try {
      const { room_id } = req.body;
      const userId = req.user.keycloakId;

      console.log("🔐 Generating Zego token for:", { userId, room_id });

      if (!room_id) {
        return res.status(400).json({
          success: false,
          message: "room_id is required",
        });
      }

      const tokenInfo = zegoService.generateToken(userId, room_id);

      res.json({
        success: true,
        token: tokenInfo.token,
        expire_time: tokenInfo.expire_time,
        appId: process.env.ZEGO_APP_ID,
      });
    } catch (error) {
      console.error("❌ Token generation failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Token generation failed",
      });
    }
  }

  // Start direct audio call
  async startAudioCall(req, res) {
    try {
      const { to, roomID } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("📞 Starting audio call:", { fromKeycloakId, to, roomID });

      // Validate required fields
      if (!to || !roomID) {
        return res.status(400).json({
          success: false,
          message: "to and roomID are required",
        });
      }

      // 🆕 SỬA: Tìm users bằng keycloakId và sử dụng ObjectId
      const [fromUser, toUser] = await Promise.all([
        getUserByKeycloakId(fromKeycloakId),
        getUserByKeycloakId(to),
      ]);

      // Create call record với ObjectId
      const call = new Call({
        roomID,
        participants: [fromUser._id, toUser._id],
        callType: "direct",
        status: "ringing",
        startedBy: fromUser._id,
        type: "audio",
        ringingStartedAt: new Date(),
        initiatedTo: toUser._id,
      });

      await call.save();

      // Add participants với ObjectId
      await call.addParticipant(fromUser._id, "joined");
      await call.addParticipant(toUser._id, "invited");

      // Emit socket event to receiver
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        socketInstance.to(to).emit("audio_call_notification", {
          id: call._id,
          roomID,
          userID: fromKeycloakId,
          userName: fromUser.userName || "User",
          streamID: `stream-${roomID}-${fromKeycloakId}`,
          name: fromUser.firstName || "User",
          type: "audio",
          callType: "direct",
          from: fromKeycloakId,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        message: "Audio call initiated successfully",
      });
    } catch (error) {
      console.error("❌ Start audio call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start audio call",
      });
    }
  }

  // Start group audio call
  async startGroupAudioCall(req, res) {
    try {
      const { participants, roomID, callTitle } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("👥 Starting group audio call:", {
        fromKeycloakId,
        participants,
        roomID,
      });

      if (!participants || !Array.isArray(participants) || !roomID) {
        return res.status(400).json({
          success: false,
          message: "participants array and roomID are required",
        });
      }

      // 🆕 SỬA: Tìm tất cả users bằng keycloakId
      const allKeycloakIds = [...new Set([...participants, fromKeycloakId])];
      const users = await getUsersByKeycloakIds(allKeycloakIds);

      const fromUser = users.find((u) => u.keycloakId === fromKeycloakId);
      const participantUsers = users.filter(
        (u) => u.keycloakId !== fromKeycloakId
      );

      const allParticipantIds = users.map((u) => u._id);

      // Create call record với ObjectId
      const call = new Call({
        roomID,
        participants: allParticipantIds,
        callType: "group",
        status: "ringing",
        startedBy: fromUser._id,
        type: "audio",
        callTitle: callTitle || "Group Call",
        ringingStartedAt: new Date(),
        maxParticipants: allParticipantIds.length,
      });

      await call.save();

      // Add all participants với ObjectId
      await call.addParticipant(fromUser._id, "joined");
      for (const user of participantUsers) {
        await call.addParticipant(user._id, "invited");
      }

      // Notify all participants
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        participants.forEach((participantKeycloakId) => {
          if (participantKeycloakId !== fromKeycloakId) {
            const participantUser = users.find(
              (u) => u.keycloakId === participantKeycloakId
            );
            socketInstance
              .to(participantKeycloakId)
              .emit("audio_call_notification", {
                id: call._id,
                roomID,
                userID: fromKeycloakId,
                userName: fromUser.userName || "User",
                streamID: `stream-${roomID}-${fromKeycloakId}`,
                name: callTitle || "Group Call",
                type: "audio",
                callType: "group",
                from: fromKeycloakId,
                participants: allKeycloakIds.map((id) => ({
                  id,
                  status: id === fromKeycloakId ? "joined" : "invited",
                })),
                timestamp: new Date().toISOString(),
              });
          }
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        participants: allKeycloakIds,
        message: "Group audio call initiated successfully",
      });
    } catch (error) {
      console.error("❌ Start group audio call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start group audio call",
      });
    }
  }

  // Start video call
  async startVideoCall(req, res) {
    try {
      const { to, roomID } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("🎥 Starting video call:", { fromKeycloakId, to, roomID });

      // Validate required fields
      if (!to || !roomID) {
        return res.status(400).json({
          success: false,
          message: "to and roomID are required",
        });
      }

      // 🆕 SỬA: Tìm users bằng keycloakId và sử dụng ObjectId
      const [fromUser, toUser] = await Promise.all([
        getUserByKeycloakId(fromKeycloakId),
        getUserByKeycloakId(to),
      ]);

      // Create call record với ObjectId
      const call = new Call({
        roomID,
        participants: [fromUser._id, toUser._id],
        callType: "direct",
        status: "ringing",
        startedBy: fromUser._id,
        type: "video",
        ringingStartedAt: new Date(),
        initiatedTo: toUser._id,
      });

      await call.save();

      // Add participants với ObjectId
      await call.addParticipant(fromUser._id, "joined");
      await call.addParticipant(toUser._id, "invited");

      // Emit socket event to receiver
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        socketInstance.to(to).emit("video_call_notification", {
          id: call._id,
          roomID,
          userID: fromKeycloakId,
          userName: fromUser.userName || "User",
          streamID: `stream-${roomID}-${fromKeycloakId}`,
          name: fromUser.firstName || "User",
          type: "video",
          callType: "direct",
          from: fromKeycloakId,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        message: "Video call initiated successfully",
      });
    } catch (error) {
      console.error("❌ Start video call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start video call",
      });
    }
  }

  // Start group video call
  async startGroupVideoCall(req, res) {
    try {
      const { participants, roomID, callTitle } = req.body;
      const fromKeycloakId = req.user.keycloakId;

      console.log("👥🎥 Starting group video call:", {
        fromKeycloakId,
        participants,
        roomID,
      });

      if (!participants || !Array.isArray(participants) || !roomID) {
        return res.status(400).json({
          success: false,
          message: "participants array and roomID are required",
        });
      }

      // 🆕 SỬA: Tìm tất cả users bằng keycloakId
      const allKeycloakIds = [...new Set([...participants, fromKeycloakId])];
      const users = await getUsersByKeycloakIds(allKeycloakIds);

      const fromUser = users.find((u) => u.keycloakId === fromKeycloakId);
      const participantUsers = users.filter(
        (u) => u.keycloakId !== fromKeycloakId
      );

      const allParticipantIds = users.map((u) => u._id);

      // Create call record với ObjectId
      const call = new Call({
        roomID,
        participants: allParticipantIds,
        callType: "group",
        status: "ringing",
        startedBy: fromUser._id,
        type: "video",
        callTitle: callTitle || "Group Video Call",
        ringingStartedAt: new Date(),
        maxParticipants: allParticipantIds.length,
      });

      await call.save();

      // Add all participants với ObjectId
      await call.addParticipant(fromUser._id, "joined");
      for (const user of participantUsers) {
        await call.addParticipant(user._id, "invited");
      }

      // Notify all participants
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        participants.forEach((participantKeycloakId) => {
          if (participantKeycloakId !== fromKeycloakId) {
            const participantUser = users.find(
              (u) => u.keycloakId === participantKeycloakId
            );
            socketInstance
              .to(participantKeycloakId)
              .emit("video_call_notification", {
                id: call._id,
                roomID,
                userID: fromKeycloakId,
                userName: fromUser.userName || "User",
                streamID: `stream-${roomID}-${fromKeycloakId}`,
                name: callTitle || "Group Video Call",
                type: "video",
                callType: "group",
                from: fromKeycloakId,
                participants: allKeycloakIds.map((id) => ({
                  id,
                  status: id === fromKeycloakId ? "joined" : "invited",
                })),
                timestamp: new Date().toISOString(),
              });
          }
        });
      }

      res.json({
        success: true,
        callId: call._id,
        roomID,
        participants: allKeycloakIds,
        message: "Group video call initiated successfully",
      });
    } catch (error) {
      console.error("❌ Start group video call failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to start group video call",
      });
    }
  }

  // Update call status (accept, decline, etc.)
  async updateCallStatus(req, res) {
    try {
      const { callId, status, duration = 0 } = req.body;
      const userKeycloakId = req.user.keycloakId;

      console.log("🔄 Updating call status:", {
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

      // 🆕 SỬA: Tìm user bằng keycloakId
      const user = await getUserByKeycloakId(userKeycloakId);

      const call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      let updateData = {};

      switch (status) {
        case "accepted":
          updateData.status = "ongoing";
          updateData.answeredAt = new Date();
          await call.updateParticipantStatus(user._id, "joined");
          break;

        case "declined":
          updateData.status = "declined";
          await call.updateParticipantStatus(user._id, "declined");
          break;

        case "missed":
          updateData.status = "missed";
          await call.updateParticipantStatus(user._id, "missed");
          break;

        case "ongoing":
          updateData.status = "ongoing";
          await call.updateParticipantStatus(user._id, "joined");
          break;

        case "cancelled":
          updateData.status = "cancelled";
          await call.updateParticipantStatus(user._id, "cancelled");
          break;

        default:
          return res.status(400).json({
            success: false,
            message: "Invalid status",
          });
      }

      Object.assign(call, updateData);
      await call.save();

      // Emit socket event
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        socketInstance.to(call.roomID).emit("call_status_updated", {
          callId,
          status: call.status,
          updatedBy: userKeycloakId,
          timestamp: new Date().toISOString(),
        });

        // Emit specific event based on call type
        if (call.type === "audio") {
          socketInstance.to(call.roomID).emit("audio_call_status_updated", {
            callId,
            status: call.status,
            updatedBy: userKeycloakId,
          });
        } else if (call.type === "video") {
          socketInstance.to(call.roomID).emit("video_call_status_updated", {
            callId,
            status: call.status,
            updatedBy: userKeycloakId,
          });
        }
      }

      res.json({
        success: true,
        callId: call._id,
        status: call.status,
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

  // End call
  async endCall(req, res) {
    try {
      const { callId, duration = 0 } = req.body;
      const endedByKeycloakId = req.user.keycloakId;

      console.log("📴 Ending call:", { callId, endedByKeycloakId, duration });

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: "callId is required",
        });
      }

      // 🆕 SỬA: Tìm user bằng keycloakId
      const endedByUser = await getUserByKeycloakId(endedByKeycloakId);

      const call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      await call.endCall(endedByUser._id, duration);

      // Notify participants that call ended
      const socketInstance = req.app.get("socketio");
      if (socketInstance) {
        socketInstance.to(call.roomID).emit("call_ended", {
          callId,
          roomID: call.roomID,
          endedBy: endedByKeycloakId,
          duration: call.duration,
          endedAt: call.endedAt,
        });

        // Emit specific events based on call type
        if (call.type === "audio") {
          socketInstance.to(call.roomID).emit("audio_call_ended", {
            callId,
            roomID: call.roomID,
            endedBy: endedByKeycloakId,
            duration: call.duration,
          });
        } else if (call.type === "video") {
          socketInstance.to(call.roomID).emit("video_call_ended", {
            callId,
            roomID: call.roomID,
            endedBy: endedByKeycloakId,
            duration: call.duration,
          });
        }

        // Also notify individual participants
        // 🆕 SỬA: Lấy keycloakIds của participants để emit
        const participantUsers = await User.find({
          _id: { $in: call.participants },
        });
        participantUsers.forEach((user) => {
          socketInstance.to(user.keycloakId).emit("call_ended_notification", {
            callId,
            roomID: call.roomID,
            endedBy: endedByKeycloakId,
            duration: call.duration,
            type: call.type,
          });
        });
      }

      res.json({
        success: true,
        callId: call._id,
        duration: call.duration,
        endedAt: call.endedAt,
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

  // Get user's call logs - ĐÃ SỬA HOÀN TOÀN
  async getCallLogs(req, res) {
    try {
      const { limit = 50, skip = 0, callType, status } = req.body;
      const userKeycloakId = req.user.keycloakId;

      console.log("📋 Fetching call logs for user:", {
        userKeycloakId,
        limit,
        skip,
      });

      // 🆕 SỬA: Tìm user bằng keycloakId trước
      const user = await getUserByKeycloakId(userKeycloakId);

      // Build query với ObjectId
      const query = { participants: user._id };

      if (callType) {
        query.callType = callType;
      }

      if (status) {
        query.status = status;
      }

      const calls = await Call.find(query)
        .sort({ startedAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .populate("startedBy", "firstName lastName avatar userName keycloakId")
        .populate(
          "participants",
          "firstName lastName avatar userName keycloakId"
        )
        .lean();

      // 🆕 SỬA: Format response với thông tin đầy đủ
      const formattedCalls = calls.map((call) => {
        // Tìm participant details
        const participantDetails =
          call.participants?.map((participant) => ({
            _id: participant._id,
            keycloakId: participant.keycloakId,
            userName: participant.userName,
            firstName: participant.firstName,
            lastName: participant.lastName,
            avatar: participant.avatar,
            status:
              call.participantStatus?.[participant._id.toString()] || "unknown",
          })) || [];

        return {
          _id: call._id,
          roomID: call.roomID,
          callType: call.callType,
          type: call.type,
          status: call.status,
          duration: call.duration,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          participants: call.participants?.map((p) => p.keycloakId) || [], // Gửi keycloakId cho frontend
          participantDetails: participantDetails,
          startedBy: call.startedBy,
          callTitle: call.callTitle,
          isIncoming: call.startedBy?.keycloakId !== userKeycloakId, // So sánh bằng keycloakId
          ringingDuration: call.ringingDuration,
          createdAt: call.createdAt,
          updatedAt: call.updatedAt,
        };
      });

      // Get total count for pagination
      const totalCount = await Call.countDocuments(query);

      res.json({
        success: true,
        calls: formattedCalls,
        total: totalCount,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(totalCount / limit),
      });
    } catch (error) {
      console.error("❌ Get call logs failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch call logs",
      });
    }
  }

  // Get call details
  async getCallDetails(req, res) {
    try {
      const { callId } = req.body;

      if (!callId) {
        return res.status(400).json({
          success: false,
          message: "callId is required",
        });
      }

      const call = await Call.findById(callId)
        .populate("startedBy", "firstName lastName avatar userName keycloakId")
        .populate("endedBy", "firstName lastName avatar userName keycloakId")
        .populate(
          "participants",
          "firstName lastName avatar userName keycloakId"
        );

      if (!call) {
        return res.status(404).json({
          success: false,
          message: "Call not found",
        });
      }

      res.json({
        success: true,
        call,
      });
    } catch (error) {
      console.error("❌ Get call details failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch call details",
      });
    }
  }

  // Get ongoing calls for user
  async getOngoingCalls(req, res) {
    try {
      const userKeycloakId = req.user.keycloakId;

      // 🆕 SỬA: Tìm user bằng keycloakId trước
      const user = await getUserByKeycloakId(userKeycloakId);

      const ongoingCalls = await Call.find({
        participants: user._id,
        status: "ongoing",
      })
        .populate("startedBy", "firstName lastName avatar userName keycloakId")
        .populate(
          "participants",
          "firstName lastName avatar userName keycloakId"
        )
        .sort({ startedAt: -1 });

      res.json({
        success: true,
        ongoingCalls,
        total: ongoingCalls.length,
      });
    } catch (error) {
      console.error("❌ Get ongoing calls failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch ongoing calls",
      });
    }
  }

  // Get call statistics
  async getCallStatistics(req, res) {
    try {
      const userKeycloakId = req.user.keycloakId;

      // 🆕 SỬA: Tìm user bằng keycloakId trước
      const user = await getUserByKeycloakId(userKeycloakId);

      const totalCalls = await Call.countDocuments({ participants: user._id });
      const completedCalls = await Call.countDocuments({
        participants: user._id,
        status: "completed",
      });
      const missedCalls = await Call.countDocuments({
        participants: user._id,
        status: "missed",
      });
      const totalDuration = await Call.aggregate([
        { $match: { participants: user._id, status: "completed" } },
        { $group: { _id: null, total: { $sum: "$duration" } } },
      ]);

      const audioCalls = await Call.countDocuments({
        participants: user._id,
        type: "audio",
      });
      const videoCalls = await Call.countDocuments({
        participants: user._id,
        type: "video",
      });

      res.json({
        success: true,
        statistics: {
          totalCalls,
          completedCalls,
          missedCalls,
          totalDuration: totalDuration[0]?.total || 0,
          audioCalls,
          videoCalls,
          completionRate:
            totalCalls > 0
              ? ((completedCalls / totalCalls) * 100).toFixed(2)
              : 0,
        },
      });
    } catch (error) {
      console.error("❌ Get call statistics failed:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch call statistics",
      });
    }
  }
}

module.exports = new CallController();
