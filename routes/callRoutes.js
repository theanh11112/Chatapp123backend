// routes/callRoutes.js - COMPLETE VERSION FOR SOCKET.IO AUDIO
const express = require("express");
const callController = require("../controllers/callController");
const { requireRole, syncUserFromToken } = require("../utils/auth");

module.exports = (keycloak) => {
  const router = express.Router();

  // ---- Middleware đồng bộ user từ Keycloak ----
  const syncUser = async (req, res, next) => {
    try {
      if (!req.kauth?.grant) {
        return res.status(401).json({
          success: false,
          message: "Token không tồn tại",
        });
      }

      const tokenParsed = req.kauth.grant.access_token.content;

      req.user = await syncUserFromToken(tokenParsed);

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Không thể xác thực user",
        });
      }

      next();
    } catch (error) {
      console.error("❌ Sync user error:", error);
      return res.status(401).json({
        success: false,
        message: "Token không hợp lệ",
      });
    }
  };

  // ---- Role permissions ----
  const allowAllExceptBot = requireRole(
    ...["user", "admin", "moderator", "guest"]
  );

  // ===========================================
  // 1. SOCKET.IO AUDIO CONFIGURATION
  // ===========================================
  router.get(
    "/socketio-config",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    (req, res) => {
      const userKeycloakId = req.user.keycloakId;

      res.json({
        success: true,
        audioMethod: "socketio",
        userId: userKeycloakId,
        signalingServer: "WebSocket/Socket.IO",
        supportedFeatures: [
          "peer-to-peer audio",
          "peer-to-peer video",
          "group calls",
          "mute/unmute",
          "audio level indicators",
          "screen sharing",
        ],
        maxParticipants: 10,
        timestamp: new Date().toISOString(),
        note: "Using Socket.IO for WebRTC signaling instead of Zego",
      });
    }
  );

  // ===========================================
  // 2. DIRECT CALLS (1-1) - SOCKET.IO VERSION
  // ===========================================
  router.post(
    "/start-audio-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startAudioCall
  );

  router.post(
    "/start-video-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startVideoCall
  );

  // ===========================================
  // 3. GROUP CALLS (MULTI-PARTICIPANT) - SOCKET.IO VERSION
  // ===========================================
  router.post(
    "/start-group-audio-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startGroupAudioCall
  );

  router.post(
    "/start-group-video-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.startGroupVideoCall
  );

  // ===========================================
  // 4. CALL STATUS MANAGEMENT
  // ===========================================
  router.post(
    "/update-call-status",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.updateCallStatus
  );

  router.post(
    "/end-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.endCall
  );

  router.post(
    "/join-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.joinCall
  );

  router.post(
    "/leave-call",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.leaveCall
  );

  // ===========================================
  // 5. CALL HISTORY & STATISTICS
  // ===========================================
  router.post(
    "/call-logs",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.getCallLogs
  );

  router.post(
    "/call-details",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.getCallDetails
  );

  router.get(
    "/ongoing-calls",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.getOngoingCalls
  );

  router.get(
    "/call-statistics",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    callController.getCallStatistics
  );

  // ===========================================
  // 6. HEALTH CHECK & INFO
  // ===========================================
  router.get("/health", (req, res) => {
    res.json({
      success: true,
      service: "Call Management API (Socket.IO Audio)",
      status: "operational",
      version: "2.0.0",
      timestamp: new Date().toISOString(),
      endpoints: {
        socketioConfig: "GET /call/socketio-config",
        directCalls: {
          startAudioCall: "POST /call/start-audio-call",
          startVideoCall: "POST /call/start-video-call",
        },
        groupCalls: {
          startGroupAudioCall: "POST /call/start-group-audio-call",
          startGroupVideoCall: "POST /call/start-group-video-call",
        },
        callManagement: {
          updateCallStatus: "POST /call/update-call-status",
          endCall: "POST /call/end-call",
          joinCall: "POST /call/join-call",
          leaveCall: "POST /call/leave-call",
        },
        history: {
          getCallLogs: "POST /call/call-logs",
          getCallDetails: "POST /call/call-details",
          getOngoingCalls: "GET /call/ongoing-calls",
          getCallStatistics: "GET /call/call-statistics",
        },
      },
      technology: "Socket.IO + WebRTC",
      zegoIntegration: false,
    });
  });

  // ===========================================
  // 7. TEST ENDPOINTS
  // ===========================================

  // Test endpoint không cần auth
  router.get("/test", (req, res) => {
    res.json({
      success: true,
      message: "📞 Call API is operational (Socket.IO Audio)",
      timestamp: new Date().toISOString(),
      availableEndpoints: {
        socketioConfig: "GET /call/socketio-config",
        audio: "POST /call/start-audio-call",
        video: "POST /call/start-video-call",
        groupAudio: "POST /call/start-group-audio-call",
        groupVideo: "POST /call/start-group-video-call",
        status: "POST /call/update-call-status",
        end: "POST /call/end-call",
        join: "POST /call/join-call",
        leave: "POST /call/leave-call",
        logs: "POST /call/call-logs",
        details: "POST /call/call-details",
        ongoing: "GET /call/ongoing-calls",
        statistics: "GET /call/call-statistics",
      },
      note: "Note: Using Socket.IO Audio instead of Zego",
      status: "operational",
    });
  });

  // 🧪 TEST SOCKET NOTIFICATION (cần auth)
  router.post(
    "/test-notification",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    async (req, res) => {
      try {
        const { targetUserId } = req.body;
        const fromUserId = req.user.keycloakId;

        console.log("🧪 Test notification requested (Socket.IO):", {
          from: fromUserId,
          to: targetUserId,
          user: req.user.username,
        });

        // Get socket instance
        const socketInstance = req.app.get("socketio");
        if (!socketInstance) {
          return res.status(500).json({
            success: false,
            message: "Socket.IO instance not available",
          });
        }

        // Check if target user exists
        const User = require("../models/user");
        const targetUser = await User.findOne({ keycloakId: targetUserId });

        if (!targetUser) {
          return res.status(404).json({
            success: false,
            message: `Target user ${targetUserId} not found`,
          });
        }

        console.log("📡 Target user info:", {
          username: targetUser.username,
          socketId: targetUser.socketId,
          status: targetUser.status,
        });

        // Create test notification data
        const notificationData = {
          callId: `test_call_${Date.now()}`,
          from: fromUserId,
          fromUser: {
            keycloakId: req.user.keycloakId,
            username: req.user.username,
            avatar: req.user.avatar,
            fullName: req.user.fullName,
          },
          to: targetUserId,
          roomID: `test_room_${Date.now()}`,
          type: "audio",
          timestamp: new Date(),
          callMethod: "socketio",
          incoming: true,
        };

        console.log("📤 Emitting test notification (Socket.IO):", {
          event: "audio_call_notification",
          targetSocketId: targetUser.socketId,
          targetKeycloakId: targetUserId,
        });

        // Try multiple ways to send notification
        let sentCount = 0;

        // 1. Send by user keycloakId (primary method)
        if (targetUserId) {
          socketInstance
            .to(targetUserId)
            .emit("audio_call_notification", notificationData);
          sentCount++;
          console.log("✅ Notification sent via keycloakId");
        }

        // 2. Send by socketId (backup method)
        if (targetUser.socketId) {
          socketInstance
            .to(targetUser.socketId)
            .emit("audio_call_notification", notificationData);
          sentCount++;
          console.log("✅ Notification sent via socketId");
        }

        // 3. Broadcast to all sockets of user (for debugging)
        if (process.env.NODE_ENV === "development") {
          const sockets = await socketInstance.fetchSockets();
          const userSockets = sockets.filter(
            (s) => s.user?.keycloakId === targetUserId
          );

          if (userSockets.length > 0) {
            userSockets.forEach((socket) => {
              socket.emit("audio_call_notification", notificationData);
            });
            sentCount += userSockets.length;
            console.log(
              `✅ Notification sent to ${userSockets.length} user sockets`
            );
          }
        }

        if (sentCount === 0) {
          console.warn(
            "⚠️ User appears to be offline or has no active socket connection"
          );
        }

        res.json({
          success: true,
          message: `Test notification sent (${sentCount} attempts)`,
          notification: notificationData,
          targetUser: {
            keycloakId: targetUserId,
            username: targetUser.username,
            socketId: targetUser.socketId,
            status: targetUser.status,
          },
          debug: {
            sentCount,
            eventName: "audio_call_notification",
            timestamp: new Date().toISOString(),
            callMethod: "socketio",
          },
        });
      } catch (error) {
        console.error("❌ Test notification error:", error);
        res.status(500).json({
          success: false,
          message: error.message || "Failed to send test notification",
          error: error.toString(),
        });
      }
    }
  );

  // 🧪 TEST SOCKET CONNECTION (không cần auth)
  router.post("/test-socket-broadcast", (req, res) => {
    try {
      const { eventName = "test_event", message = "Hello from server!" } =
        req.body;

      const socketInstance = req.app.get("socketio");
      if (!socketInstance) {
        return res.status(500).json({
          success: false,
          message: "Socket.IO instance not available",
        });
      }

      console.log("📡 Broadcasting to all connected clients:", {
        eventName,
        message,
      });

      // Get all connected sockets
      socketInstance.fetchSockets().then((sockets) => {
        console.log(`👥 Active sockets: ${sockets.length}`);

        sockets.forEach((socket) => {
          console.log(
            `  - ${socket.id}: ${socket.user?.keycloakId || "unknown"}`
          );
        });
      });

      // Broadcast to everyone
      socketInstance.emit(eventName, {
        message,
        timestamp: new Date().toISOString(),
        server: "Backend Test",
        technology: "Socket.IO Audio",
      });

      res.json({
        success: true,
        message: `Event '${eventName}' broadcasted to all clients`,
        data: { eventName, message },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Socket broadcast error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  });

  // 🧪 GET ALL ACTIVE SOCKET CONNECTIONS (cho admin/debug)
  router.get(
    "/active-sockets",
    keycloak.protect(),
    syncUser,
    requireRole("admin", "moderator"),
    async (req, res) => {
      try {
        const socketInstance = req.app.get("socketio");
        if (!socketInstance) {
          return res.status(500).json({
            success: false,
            message: "Socket.IO instance not available",
          });
        }

        const sockets = await socketInstance.fetchSockets();
        const activeConnections = sockets.map((socket) => ({
          socketId: socket.id,
          userId: socket.user?.keycloakId,
          username: socket.user?.username,
          connectedAt: socket.handshake.issued,
          rooms: Array.from(socket.rooms),
          callMethod: "socketio",
        }));

        // Get all users from database
        const User = require("../models/user");
        const allUsers = await User.find({}).select(
          "keycloakId username socketId status lastSeen"
        );

        res.json({
          success: true,
          socketServer: {
            totalConnections: sockets.length,
            connectedSockets: activeConnections,
            technology: "Socket.IO",
          },
          databaseUsers: allUsers.map((user) => ({
            keycloakId: user.keycloakId,
            username: user.username,
            socketId: user.socketId,
            status: user.status,
            lastSeen: user.lastSeen,
            isCurrentlyConnected: activeConnections.some(
              (s) => s.userId === user.keycloakId
            ),
          })),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Get active sockets error:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }
  );

  // ===========================================
  // 8. CLEANUP & ADMIN ENDPOINTS
  // ===========================================
  router.post(
    "/cleanup-old-calls",
    keycloak.protect(),
    syncUser,
    requireRole("admin", "moderator"),
    callController.cleanupOldCalls
  );

  router.get(
    "/cleanup-stats",
    keycloak.protect(),
    syncUser,
    requireRole("admin", "moderator"),
    callController.getCleanupStats
  );

  // ===========================================
  // 9. WEBRTC SIGNALING ENDPOINTS (Optional)
  // ===========================================

  // Endpoint để lấy WebRTC configuration
  router.get(
    "/webrtc-config",
    keycloak.protect(),
    syncUser,
    allowAllExceptBot,
    (req, res) => {
      res.json({
        success: true,
        webrtc: {
          signalingServer: "Socket.IO",
          stunServers: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
          ],
          turnServers: process.env.TURN_SERVERS
            ? JSON.parse(process.env.TURN_SERVERS)
            : [],
          iceTransportPolicy: "all",
          bundlePolicy: "balanced",
          rtcpMuxPolicy: "require",
        },
        socketioEvents: {
          offer: "webrtc_offer",
          answer: "webrtc_answer",
          iceCandidate: "ice_candidate",
          joinRoom: "join_call_room",
          leaveRoom: "leave_call_room",
        },
        timestamp: new Date().toISOString(),
      });
    }
  );

  // ===========================================
  // 10. 404 HANDLER FOR CALL ROUTES
  // ===========================================
  router.use("*", (req, res) => {
    res.status(404).json({
      success: false,
      message: "Call API endpoint not found",
      note: "Using Socket.IO Audio instead of Zego",
      availableEndpoints: [
        "GET /call/socketio-config",
        "POST /call/start-audio-call",
        "POST /call/start-video-call",
        "POST /call/start-group-audio-call",
        "POST /call/start-group-video-call",
        "POST /call/update-call-status",
        "POST /call/end-call",
        "POST /call/join-call",
        "POST /call/leave-call",
        "POST /call/call-logs",
        "POST /call/call-details",
        "GET /call/ongoing-calls",
        "GET /call/call-statistics",
        "GET /call/health",
        "GET /call/webrtc-config",
      ],
    });
  });

  return router;
};
