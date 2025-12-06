// events/call.js - SOCKET.IO AUDIO VERSION - ĐÃ SỬA
const User = require("../../models/user");
const Call = require("../../models/call");
const AuditLog = require("../../models/auditLog");

module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;

  if (!currentUserId) {
    console.warn("Socket connected without user info!");
    return;
  }

  console.log(
    `🔊 [Socket.IO Audio] Call events loaded for user: ${currentUserId}`
  );

  // ==================== HELPER FUNCTIONS ====================

  // Map để chặn duplicate call creation
  const callCreationLocks = new Map();

  // Helper để tạo lock key
  const getCallLockKey = (from, to, type = "audio") => {
    return `${from}_${to}_${type}_${Date.now()}`;
  };

  // Helper để tạo roomID nếu không có
  const generateRoomID = (type = "audio") => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}_room_${timestamp}_${random}`;
  };

  // Helper function to update call status - SỬA: Đơn giản hóa
  const updateCallStatus = async (callId, statusUpdate) => {
    try {
      const call = await Call.findById(callId);
      if (!call) {
        console.warn(`Call not found: ${callId}`);
        return null;
      }

      // Update status
      Object.assign(call, statusUpdate);
      await call.save();

      console.log(`📞 Call ${call._id} status updated: ${call.status}`);

      // Emit to all participants
      call.participants.forEach((participantId) => {
        io.to(participantId).emit(`call_status_update`, {
          callId: call._id,
          status: call.status,
          timestamp: new Date(),
        });
      });

      return call;
    } catch (error) {
      console.error("❌ Error updating call status:", error);
      return null;
    }
  };

  // Helper để tìm và xử lý existing call
  // Helper để tìm và xử lý existing call - SỬA: LUÔN TẠO MỚI
  const findOrCreateCall = async ({
    from,
    to,
    type,
    roomID,
    callMethod = "socketio",
  }) => {
    try {
      console.log(`🔍 findOrCreateCall: ${from} -> ${to}, type: ${type}`);

      // 🎯 LUÔN TẠO CALL MỚI, KHÔNG CHECK EXISTING
      const finalRoomID = roomID || generateRoomID(type);
      console.log(`🎯 Creating NEW call with roomID: ${finalRoomID}`);

      const call = await Call.createDirectCall({
        from,
        to,
        type,
        roomID: finalRoomID,
        callMethod,
      });

      console.log(`✅ New call created: ${call._id}`);
      return {
        call,
        isNew: true,
        message: "New call created",
      };
    } catch (error) {
      console.error("❌ Error in findOrCreateCall:", error);
      throw error;
    }
  };

  // Helper để gửi notification
  // Helper để gửi notification
  const sendCallNotification = async (
    call,
    toUserId,
    notificationType = "audio"
  ) => {
    try {
      const fromUser = await User.findOne({ keycloakId: call.startedBy });
      const toUser = await User.findOne({ keycloakId: toUserId });

      console.log(`🔍 Notification user lookup:`, {
        fromUser: fromUser?.username,
        toUser: toUser?.username,
        toUserSocketId: toUser?.socketId,
        toUserStatus: toUser?.status,
      });

      if (!fromUser || !toUser) {
        throw new Error("User not found");
      }

      const notificationData = {
        callId: call._id,
        from: call.startedBy,
        fromUser: {
          keycloakId: fromUser.keycloakId,
          username: fromUser.username,
          avatar: fromUser.avatar,
          fullName: fromUser.fullName || fromUser.username,
        },
        roomID: call.roomID,
        type: call.type,
        timestamp: new Date(),
        callMethod: call.callMethod,
      };

      const eventName =
        notificationType === "audio"
          ? "audio_call_notification"
          : "video_call_notification";

      // Gửi đến người nhận qua nhiều cách
      console.log(
        `📤 Sending ${notificationType} notification to: ${toUserId}`
      );
      console.log(`   Event: ${eventName}`);
      console.log(`   Room ID: ${call.roomID}`);
      console.log(`   Call ID: ${call._id}`);

      // Cách 1: Gửi qua keycloakId room (chính xác nhất)
      console.log(`   Sending via keycloakId room: ${toUserId}`);
      io.to(toUserId).emit(eventName, notificationData);

      // Cách 2: Gửi qua socketId nếu có
      if (toUser.socketId && toUser.socketId !== socket.id) {
        console.log(`   Also sending via socketId: ${toUser.socketId}`);
        io.to(toUser.socketId).emit(eventName, {
          ...notificationData,
          viaSocketId: true,
        });
      }

      // Cách 3: Debug - kiểm tra xem user có đang online không
      const onlineSockets = await io.fetchSockets();
      const userSockets = onlineSockets.filter(
        (s) => s.user?.keycloakId === toUserId
      );
      console.log(
        `   User ${toUserId} has ${userSockets.length} active sockets`
      );

      if (userSockets.length === 0) {
        console.warn(`⚠️ User ${toUserId} appears to be offline`);
      }

      return notificationData;
    } catch (error) {
      console.error(
        `❌ Error sending ${notificationType} notification:`,
        error
      );
      throw error;
    }
  };

  // Thêm vào phần helper functions
  const forwardAnswerToCaller = async (callId, answerData) => {
    try {
      const call = await Call.findById(callId);
      if (!call) {
        console.error(`❌ Call ${callId} not found for answer forwarding`);
        return false;
      }

      const callerId = call.startedBy;
      const calleeId = answerData.from;

      console.log(
        `📤 Forwarding answer from ${calleeId} to caller ${callerId}`
      );

      // Forward answer đến caller
      io.to(callerId).emit("webrtc_answer", {
        from: calleeId,
        answer: answerData.answer,
        roomID: call.roomID,
        callId: call._id,
        timestamp: new Date(),
      });

      console.log(`✅ Answer forwarded to caller ${callerId}`);

      // Cập nhật call record với answer
      const participant = call.participantDetails.find(
        (p) => p.userId === calleeId
      );
      if (participant) {
        if (!participant.webrtc) participant.webrtc = {};
        participant.webrtc.answer = answerData.answer;
        await call.save();
      }

      return true;
    } catch (error) {
      console.error("❌ Error forwarding answer:", error);
      return false;
    }
  };

  // ==================== SOCKET.IO AUDIO CALL ====================

  // 🎯 SỬA: Chỉ giữ 1 hàm start_audio_call
  socket.on("start_audio_call", async ({ to, roomID }) => {
    const lockKey = getCallLockKey(currentUserId, to, "audio");

    // Kiểm tra lock để tránh duplicate
    if (callCreationLocks.has(lockKey)) {
      console.log(`⚠️ Duplicate audio call creation prevented: ${lockKey}`);
      return;
    }

    callCreationLocks.set(lockKey, true);

    try {
      console.log("🔊 [Socket.IO] Starting audio call:", {
        from: currentUserId,
        to,
        roomID,
      });

      // 🎯 SỬA: Chỉ validate 'to', roomID có thể tự động sinh
      if (!to) {
        return socket.emit("call_error", {
          message: "Missing required field: 'to' (recipient)",
        });
      }

      // Tìm hoặc tạo call
      const result = await findOrCreateCall({
        from: currentUserId,
        to,
        type: "audio",
        roomID,
        callMethod: "socketio",
      });

      const { call, isNew } = result;

      // Nếu là call mới, gửi notification
      if (isNew) {
        // Gửi notification đến người nhận
        await sendCallNotification(call, to, "audio");

        // Thông báo cho người gọi
        socket.emit("audio_call_started", {
          callId: call._id,
          to,
          roomID: call.roomID,
          timestamp: new Date(),
          callMethod: "socketio",
          isNew: true,
        });

        // Audit log
        await AuditLog.create({
          user: currentUserId,
          action: "start_audio_call",
          targetId: to,
          metadata: {
            callId: call._id,
            roomID: call.roomID,
            method: "socketio",
          },
        });

        console.log(`✅ Audio call setup complete: ${currentUserId} -> ${to}`);
      } else {
        // Nếu join existing call
        socket.emit("join_existing_call", {
          callId: call._id,
          roomID: call.roomID,
          status: call.status,
          timestamp: new Date(),
          isNew: false,
        });
      }
    } catch (error) {
      console.error("❌ Error starting audio call:", error);
      socket.emit("call_error", {
        message: "Failed to start audio call",
        error: error.message,
      });
    } finally {
      // Xóa lock sau 2 giây
      setTimeout(() => {
        callCreationLocks.delete(lockKey);
      }, 2000);
    }
  });

  // ==================== SOCKET.IO VIDEO CALL ====================

  socket.on("start_video_call", async ({ to, roomID }) => {
    const lockKey = getCallLockKey(currentUserId, to, "video");

    if (callCreationLocks.has(lockKey)) {
      console.log(`⚠️ Duplicate video call creation prevented: ${lockKey}`);
      return;
    }

    callCreationLocks.set(lockKey, true);

    try {
      console.log("🎥 [Socket.IO] Starting video call:", {
        from: currentUserId,
        to,
        roomID,
      });

      if (!to) {
        return socket.emit("call_error", {
          message: "Missing required field: 'to' (recipient)",
        });
      }

      // Tìm hoặc tạo call
      const result = await findOrCreateCall({
        from: currentUserId,
        to,
        type: "video",
        roomID,
        callMethod: "socketio",
      });

      const { call, isNew } = result;

      // Nếu là call mới, gửi notification
      if (isNew) {
        // Gửi notification đến người nhận
        await sendCallNotification(call, to, "video");

        // Thông báo cho người gọi
        socket.emit("video_call_started", {
          callId: call._id,
          to,
          roomID: call.roomID,
          timestamp: new Date(),
          callMethod: "socketio",
          isNew: true,
        });

        // Audit log
        await AuditLog.create({
          user: currentUserId,
          action: "start_video_call",
          targetId: to,
          metadata: {
            callId: call._id,
            roomID: call.roomID,
            method: "socketio",
          },
        });

        console.log(`✅ Video call setup complete: ${currentUserId} -> ${to}`);
      } else {
        // Nếu join existing call
        socket.emit("join_existing_call", {
          callId: call._id,
          roomID: call.roomID,
          status: call.status,
          timestamp: new Date(),
          isNew: false,
        });
      }
    } catch (error) {
      console.error("❌ Error starting video call:", error);
      socket.emit("call_error", {
        message: "Failed to start video call",
        error: error.message,
      });
    } finally {
      // Xóa lock sau 2 giây
      setTimeout(() => {
        callCreationLocks.delete(lockKey);
      }, 2000);
    }
  });

  // ==================== CALL RESPONSES - SỬA ĐƠN GIẢN HÓA ====================

  // Audio call accepted
  socket.on("audio_call_accepted", async ({ callId, roomID }) => {
    try {
      console.log("📞 Audio call accepted:", {
        userId: currentUserId,
        callId,
        roomID,
      });

      let call;

      // Tìm call bằng callId hoặc roomID
      if (callId) {
        call = await Call.findById(callId);
      } else if (roomID) {
        call = await Call.findOne({
          roomID,
          participants: currentUserId,
          status: "ringing",
          type: "audio",
        });
      }

      if (!call) {
        return socket.emit("call_error", {
          message: "Call not found or already ended",
        });
      }

      // Cập nhật trạng thái call
      await call.acceptCall(currentUserId);

      console.log(`✅ Call ${call._id} accepted by ${currentUserId}`);

      // Thông báo cho người gọi
      const callerId = call.startedBy;
      if (callerId !== currentUserId) {
        const callerUser = await User.findOne({ keycloakId: callerId });
        if (callerUser?.socketId) {
          io.to(callerUser.socketId).emit("audio_call_accepted", {
            callId: call._id,
            from: callerId,
            to: currentUserId,
            roomID: call.roomID,
            type: "audio",
            status: "ongoing",
            timestamp: new Date(),
            method: "socketio",
          });
        }

        // Cũng gửi qua keycloakId room
        io.to(callerId).emit("audio_call_accepted", {
          callId: call._id,
          from: callerId,
          to: currentUserId,
          roomID: call.roomID,
          timestamp: new Date(),
          method: "socketio",
        });
      }

      // Thông báo cho người nhận (chính mình)
      socket.emit("call_accepted", {
        callId: call._id,
        roomID: call.roomID,
        timestamp: new Date(),
        method: "socketio",
      });

      // Audit log
      await AuditLog.create({
        user: currentUserId,
        action: "audio_call_accepted",
        targetId: callerId,
        metadata: {
          callId: call._id,
          roomID: call.roomID,
          method: "socketio",
        },
      });
    } catch (error) {
      console.error("❌ Error accepting audio call:", error);
      socket.emit("call_error", {
        message: "Failed to accept call",
        error: error.message,
      });
    }
  });

  // Audio call declined
  socket.on("audio_call_declined", async ({ callId, roomID }) => {
    try {
      console.log("📞 Audio call declined:", {
        userId: currentUserId,
        callId,
        roomID,
      });

      let call;

      if (callId) {
        call = await Call.findById(callId);
      } else if (roomID) {
        call = await Call.findOne({
          roomID,
          participants: currentUserId,
          status: "ringing",
          type: "audio",
        });
      }

      if (!call) {
        return socket.emit("call_error", {
          message: "Call not found",
        });
      }

      // Cập nhật trạng thái call
      await call.declineCall(currentUserId);

      console.log(`❌ Call ${call._id} declined by ${currentUserId}`);

      // Thông báo cho người gọi
      const callerId = call.startedBy;
      if (callerId !== currentUserId) {
        io.to(callerId).emit("audio_call_declined", {
          callId: call._id,
          from: callerId,
          to: currentUserId,
          roomID: call.roomID,
          type: "audio",
          status: "declined",
          timestamp: new Date(),
          method: "socketio",
        });
      }

      // Audit log
      await AuditLog.create({
        user: currentUserId,
        action: "audio_call_declined",
        targetId: callerId,
        metadata: {
          callId: call._id,
          roomID: call.roomID,
          method: "socketio",
        },
      });
    } catch (error) {
      console.error("❌ Error declining audio call:", error);
      socket.emit("call_error", {
        message: "Failed to decline call",
        error: error.message,
      });
    }
  });

  // Tương tự cho video call responses
  socket.on("video_call_accepted", async ({ callId, roomID }) => {
    try {
      console.log("🎥 Video call accepted:", {
        userId: currentUserId,
        callId,
        roomID,
      });

      let call;

      if (callId) {
        call = await Call.findById(callId);
      } else if (roomID) {
        call = await Call.findOne({
          roomID,
          participants: currentUserId,
          status: "ringing",
          type: "video",
        });
      }

      if (!call) {
        return socket.emit("call_error", {
          message: "Call not found or already ended",
        });
      }

      // Cập nhật trạng thái call
      await call.acceptCall(currentUserId);

      console.log(`✅ Video call ${call._id} accepted by ${currentUserId}`);

      // Thông báo cho người gọi
      const callerId = call.startedBy;
      if (callerId !== currentUserId) {
        io.to(callerId).emit("video_call_accepted", {
          callId: call._id,
          from: callerId,
          to: currentUserId,
          roomID: call.roomID,
          type: "video",
          status: "ongoing",
          timestamp: new Date(),
          method: "socketio",
        });
      }

      // Thông báo cho người nhận
      socket.emit("call_accepted", {
        callId: call._id,
        roomID: call.roomID,
        timestamp: new Date(),
        method: "socketio",
        type: "video",
      });

      // Audit log
      await AuditLog.create({
        user: currentUserId,
        action: "video_call_accepted",
        targetId: callerId,
        metadata: {
          callId: call._id,
          roomID: call.roomID,
          method: "socketio",
        },
      });
    } catch (error) {
      console.error("❌ Error accepting video call:", error);
      socket.emit("call_error", {
        message: "Failed to accept video call",
        error: error.message,
      });
    }
  });

  // ==================== WEBRTC SIGNALING VIA SOCKET.IO ====================

  // WebRTC offer - SỬA: Thêm validation
  socket.on("webrtc_offer", (data) => {
    const { to, offer, roomID, callId } = data;

    console.log(`📤 WebRTC offer from ${currentUserId} to ${to}`, {
      roomID,
      callId: callId ? callId.substring(0, 8) + "..." : "none",
    });

    if (!to) {
      return socket.emit("call_error", {
        message: "Missing 'to' field for WebRTC offer",
      });
    }

    // Validate offer
    if (!offer || !offer.type || !offer.sdp) {
      return socket.emit("call_error", {
        message: "Invalid WebRTC offer format",
      });
    }

    io.to(to).emit("webrtc_offer", {
      from: currentUserId,
      offer,
      roomID: roomID || `webrtc_room_${Date.now()}`,
      callId,
      type: "offer",
      timestamp: new Date(),
    });
  });

  // WebRTC answer - SỬA: Thêm validation
  socket.on("webrtc_answer", (data) => {
    const { to, answer, roomID, callId } = data;

    console.log(`📥 WebRTC answer from ${currentUserId} to ${to}`);

    if (!to) {
      return socket.emit("call_error", {
        message: "Missing 'to' field for WebRTC answer",
      });
    }

    // Validate answer
    if (!answer || !answer.type || !answer.sdp) {
      return socket.emit("call_error", {
        message: "Invalid WebRTC answer format",
      });
    }

    io.to(to).emit("webrtc_answer", {
      from: currentUserId,
      answer,
      roomID,
      callId,
      type: "answer",
      timestamp: new Date(),
    });
  });

  // ICE Candidate exchange - SỬA: Thêm validation
  socket.on("ice_candidate", (data) => {
    const { to, candidate, roomID, callId } = data;

    console.log(`🧊 ICE candidate from ${currentUserId} to ${to}`);

    if (!to) {
      return socket.emit("call_error", {
        message: "Missing 'to' field for ICE candidate",
      });
    }

    if (!candidate || !candidate.candidate) {
      return socket.emit("call_error", {
        message: "Invalid ICE candidate format",
      });
    }

    io.to(to).emit("ice_candidate", {
      from: currentUserId,
      candidate,
      roomID,
      callId,
      timestamp: new Date(),
    });
  });

  // ==================== SOCKET.IO ROOM MANAGEMENT ====================

  // Join call room - SỬA: Thêm validation và xử lý callId
  socket.on("join_call_room", ({ roomID, callId }) => {
    console.log(`🚪 ${currentUserId} joining call room:`, {
      roomID,
      callId: callId ? callId.substring(0, 8) + "..." : "none",
    });

    if (!roomID) {
      return socket.emit("call_error", {
        message: "Missing roomID for join_call_room",
      });
    }

    // Join the Socket.IO room
    socket.join(roomID);

    console.log(`✅ ${currentUserId} joined room: ${roomID}`);

    // Notify others in the room
    socket.to(roomID).emit("user_joined_call", {
      userId: currentUserId,
      roomID,
      callId,
      timestamp: new Date(),
      method: "socketio",
    });

    // Confirm to sender
    socket.emit("call_room_joined", {
      roomID,
      callId,
      timestamp: new Date(),
      method: "socketio",
    });
  });

  // Debug: Check socket connections
  socket.on("debug_socket_connections", async ({ userId }) => {
    try {
      const sockets = await io.fetchSockets();
      const targetSockets = sockets.filter(
        (s) => s.user?.keycloakId === userId
      );

      socket.emit("debug_socket_connections_response", {
        targetUserId: userId,
        socketCount: targetSockets.length,
        sockets: targetSockets.map((s) => ({
          socketId: s.id,
          userId: s.user?.keycloakId,
          username: s.user?.username,
          rooms: Array.from(s.rooms),
        })),
        timestamp: new Date(),
      });

      console.log(
        `🔍 Debug sockets for ${userId}: ${targetSockets.length} connections`
      );
    } catch (error) {
      console.error("❌ Error in debug_socket_connections:", error);
      socket.emit("debug_socket_connections_error", { error: error.message });
    }
  });

  // Leave call room - SỬA: Thêm validation
  socket.on("leave_call_room", ({ roomID, callId }) => {
    console.log(`🚪 ${currentUserId} leaving call room: ${roomID}`);

    if (!roomID) {
      console.warn(
        `⚠️ No roomID provided for leave_call_room by ${currentUserId}`
      );
      return;
    }

    socket.leave(roomID);

    // Notify others in the room
    socket.to(roomID).emit("user_left_call", {
      userId: currentUserId,
      roomID,
      callId,
      timestamp: new Date(),
      method: "socketio",
    });

    // Confirm to sender
    socket.emit("call_room_left", {
      roomID,
      callId,
      timestamp: new Date(),
      method: "socketio",
    });
  });

  // End call - SỬA: Thêm event mới
  socket.on("end_call", async ({ callId, roomID }) => {
    try {
      console.log(`📴 ${currentUserId} ending call:`, {
        callId,
        roomID,
      });

      let call;

      if (callId) {
        call = await Call.findById(callId);
      } else if (roomID) {
        call = await Call.findOne({
          roomID,
          participants: currentUserId,
          status: { $in: ["ringing", "ongoing"] },
        });
      }

      if (!call) {
        return socket.emit("call_error", {
          message: "Call not found or already ended",
        });
      }

      // Kết thúc call
      await call.endCall(currentUserId);

      console.log(`✅ Call ${call._id} ended by ${currentUserId}`);

      // Thông báo cho tất cả participants
      call.participants.forEach((participantId) => {
        if (participantId !== currentUserId) {
          io.to(participantId).emit("call_ended", {
            callId: call._id,
            endedBy: currentUserId,
            roomID: call.roomID,
            duration: call.duration,
            timestamp: new Date(),
            method: "socketio",
          });
        }
      });

      // Thông báo cho chính mình
      socket.emit("call_ended", {
        callId: call._id,
        endedBy: currentUserId,
        roomID: call.roomID,
        duration: call.duration,
        timestamp: new Date(),
        method: "socketio",
      });

      // Audit log
      await AuditLog.create({
        user: currentUserId,
        action: "end_call",
        targetId: call.participants
          .filter((id) => id !== currentUserId)
          .join(","),
        metadata: {
          callId: call._id,
          roomID: call.roomID,
          duration: call.duration,
          method: "socketio",
        },
      });
    } catch (error) {
      console.error("❌ Error ending call:", error);
      socket.emit("call_error", {
        message: "Failed to end call",
        error: error.message,
      });
    }
  });

  // User is ready for call (audio/video stream ready) - GIỮ NGUYÊN
  socket.on("call_user_ready", ({ roomID, streamType }) => {
    console.log(
      `✅ ${currentUserId} is ready in room ${roomID} (${streamType})`
    );

    if (!roomID) {
      console.warn(
        `⚠️ No roomID provided for call_user_ready by ${currentUserId}`
      );
      return;
    }

    socket.to(roomID).emit("user_call_ready", {
      userId: currentUserId,
      roomID,
      streamType,
      timestamp: new Date(),
    });
  });

  // Mute/Unmute audio - SỬA: Thêm validation
  socket.on("toggle_audio_mute", ({ roomID, isMuted }) => {
    console.log(
      `🔇 ${currentUserId} ${isMuted ? "muted" : "unmuted"} in room ${roomID}`
    );

    if (!roomID) {
      console.warn(
        `⚠️ No roomID provided for toggle_audio_mute by ${currentUserId}`
      );
      return;
    }

    socket.to(roomID).emit("user_audio_mute_changed", {
      userId: currentUserId,
      roomID,
      isMuted,
      timestamp: new Date(),
    });
  });

  // Toggle video - SỬA: Thêm validation
  socket.on("toggle_video", ({ roomID, isVideoOn }) => {
    console.log(
      `📹 ${currentUserId} ${
        isVideoOn ? "enabled" : "disabled"
      } video in room ${roomID}`
    );

    if (!roomID) {
      console.warn(
        `⚠️ No roomID provided for toggle_video by ${currentUserId}`
      );
      return;
    }

    socket.to(roomID).emit("user_video_changed", {
      userId: currentUserId,
      roomID,
      isVideoOn,
      timestamp: new Date(),
    });
  });

  // Screen sharing - SỬA: Thêm validation
  socket.on("toggle_screen_share", ({ roomID, isSharing }) => {
    console.log(
      `🖥️ ${currentUserId} ${
        isSharing ? "started" : "stopped"
      } screen share in room ${roomID}`
    );

    if (!roomID) {
      console.warn(
        `⚠️ No roomID provided for toggle_screen_share by ${currentUserId}`
      );
      return;
    }

    socket.to(roomID).emit("user_screen_share_changed", {
      userId: currentUserId,
      roomID,
      isSharing,
      timestamp: new Date(),
    });
  });

  // ==================== DEBUG & UTILITY ====================

  // Debug event để kiểm tra call info
  socket.on("debug_call_info", async () => {
    try {
      const activeCalls = await Call.find({
        participants: currentUserId,
        status: { $in: ["ringing", "ongoing"] },
      }).limit(5);

      const callInfo = activeCalls.map((call) => ({
        id: call._id,
        type: call.type,
        status: call.status,
        roomID: call.roomID,
        participants: call.participants,
        startedAt: call.startedAt,
        isActive: call.isActive,
      }));

      socket.emit("debug_call_info_response", {
        userId: currentUserId,
        activeCalls: callInfo,
        timestamp: new Date(),
      });

      console.log(`🔍 Debug call info for ${currentUserId}:`, callInfo);
    } catch (error) {
      console.error("❌ Error in debug_call_info:", error);
      socket.emit("debug_call_info_error", { error: error.message });
    }
  });

  // ==================== DISCONNECT HANDLING ====================

  socket.on("disconnect", () => {
    console.log(
      `🔊 [Socket.IO] Call events disconnected for user: ${currentUserId}`
    );

    // Notify all call rooms this user was in
    const rooms = Array.from(socket.rooms);
    rooms.forEach((roomId) => {
      if (roomId !== socket.id) {
        socket.to(roomId).emit("user_disconnected_from_call", {
          userId: currentUserId,
          roomId,
          timestamp: new Date(),
          method: "socketio",
        });

        console.log(
          `📤 Notified room ${roomId} about disconnect of ${currentUserId}`
        );
      }
    });
  });
};
