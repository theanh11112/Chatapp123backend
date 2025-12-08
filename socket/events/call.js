// events/call.js - SOCKET.IO AUDIO/VERSION - HOÀN THIỆN & CLEAN
const User = require("../../models/user");
const Call = require("../../models/call");
const AuditLog = require("../../models/auditLog");

module.exports = (socket, io) => {
  const currentUserId = socket.user?.keycloakId;

  if (!currentUserId) {
    console.warn("❌ Socket connected without user info!");
    return;
  }

  console.log(`🔊 [Call Events] Loaded for user: ${currentUserId}`);

  // ==================== CLEAN HELPER FUNCTIONS ====================

  const callCreationLocks = new Map();

  const getCallLockKey = (from, to, type = "audio") => {
    return `${from}_${to}_${type}_${Date.now()}`;
  };

  const generateRoomID = (type = "audio") => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${type}_room_${timestamp}_${random}`;
  };

  const sendCallNotification = async (
    call,
    toUserId,
    notificationType = "audio"
  ) => {
    try {
      const [fromUser, toUser] = await Promise.all([
        User.findOne({ keycloakId: call.startedBy }),
        User.findOne({ keycloakId: toUserId }),
      ]);

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

      console.log(
        `📤 Sending ${notificationType} notification to: ${toUserId}`
      );
      io.to(toUserId).emit(eventName, notificationData);

      return notificationData;
    } catch (error) {
      console.error(
        `❌ Error sending ${notificationType} notification:`,
        error
      );
      throw error;
    }
  };

  const findOrCreateCall = async ({
    from,
    to,
    type,
    roomID,
    callMethod = "socketio",
  }) => {
    try {
      console.log(`🔍 Creating call: ${from} -> ${to}, type: ${type}`);

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
      return { call, isNew: true };
    } catch (error) {
      console.error("❌ Error in findOrCreateCall:", error);
      throw error;
    }
  };

  // ==================== CALL INITIATION ====================

  const handleCallStart = async (
    type,
    { to, roomID },
    actionName,
    callback
  ) => {
    const lockKey = getCallLockKey(currentUserId, to, type);

    // 1. Prevent duplicate calls
    if (callCreationLocks.has(lockKey)) {
      console.log(`⚠️ Duplicate ${type} call creation prevented: ${lockKey}`);

      // Send callback if provided
      if (callback && typeof callback === "function") {
        callback({
          success: false,
          message: "Duplicate call creation prevented",
          error: "Another call to this user is already in progress",
          lockKey,
        });
      }

      return socket.emit("call_error", {
        message: "Another call to this user is already in progress",
        code: "DUPLICATE_CALL",
        lockKey,
      });
    }

    // 2. Set call creation lock
    callCreationLocks.set(lockKey, {
      timestamp: Date.now(),
      from: currentUserId,
      to,
      type,
    });

    try {
      console.log(`🔊 [${type.toUpperCase()} Call] Starting:`, {
        from: currentUserId,
        to,
        roomID,
        lockKey,
        socketId: socket.id,
      });

      // 3. Validate required fields
      if (!to) {
        const errorMsg = "Missing required field: 'to' (recipient)";

        if (callback && typeof callback === "function") {
          callback({
            success: false,
            message: errorMsg,
            error: "VALIDATION_ERROR",
            required: ["to", "roomID"],
            provided: { to, roomID },
          });
        }

        return socket.emit("call_error", {
          message: errorMsg,
          code: "VALIDATION_ERROR",
          required: ["to", "roomID"],
        });
      }

      // 4. Validate recipient exists and is online
      try {
        const recipient = await User.findOne({ keycloakId: to });
        if (!recipient) {
          throw new Error(`Recipient ${to} not found`);
        }

        // Check if recipient is online (optional)
        const recipientSockets = await io.in(to).fetchSockets();
        if (recipientSockets.length === 0) {
          console.log(`ℹ️ Recipient ${to} is offline`);
        }
      } catch (userError) {
        console.error(`❌ Recipient validation failed:`, userError.message);

        if (callback && typeof callback === "function") {
          callback({
            success: false,
            message: "Recipient not found or unavailable",
            error: userError.message,
            code: "RECIPIENT_UNAVAILABLE",
          });
        }

        return socket.emit("call_error", {
          message: "Recipient not found or unavailable",
          error: userError.message,
          code: "RECIPIENT_UNAVAILABLE",
        });
      }

      // 5. Create call record
      const result = await findOrCreateCall({
        from: currentUserId,
        to,
        type,
        roomID,
        callMethod: "socketio",
      });

      const { call, isNew } = result;

      // 6. Send notification to recipient
      const notificationSent = await sendCallNotification(call, to, type);

      if (!notificationSent) {
        throw new Error("Failed to send call notification");
      }

      // 7. Emit success event to caller
      const successData = {
        callId: call._id,
        to,
        roomID: call.roomID,
        timestamp: new Date(),
        callMethod: "socketio",
        isNew,
        notificationId: notificationSent?.notificationId || null,
      };

      socket.emit(`${type}_call_started`, successData);

      // 8. Call callback with success (if provided)
      if (callback && typeof callback === "function") {
        callback({
          success: true,
          callId: call._id,
          roomID: call.roomID,
          to,
          type,
          message: `${type} call started successfully`,
          timestamp: new Date(),
          data: successData,
        });
      }

      // 9. Log audit trail
      await AuditLog.create({
        user: currentUserId,
        action: actionName,
        targetId: to,
        metadata: {
          callId: call._id,
          roomID: call.roomID,
          method: "socketio",
          type,
          socketId: socket.id,
          notificationSent: !!notificationSent,
          isNew,
        },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers["user-agent"],
      });

      // 10. Emit call metrics for monitoring
      io.emit("call_metrics", {
        action: "call_started",
        callId: call._id,
        type,
        from: currentUserId,
        to,
        roomID: call.roomID,
        timestamp: new Date(),
        success: true,
      });

      console.log(`✅ ${type} call setup complete:`, {
        callId: call._id,
        from: currentUserId,
        to,
        roomID: call.roomID,
        duration: Date.now() - callCreationLocks.get(lockKey).timestamp,
      });
    } catch (error) {
      console.error(`❌ Error starting ${type} call:`, {
        error: error.message,
        stack: error.stack,
        from: currentUserId,
        to,
        type,
      });

      // 11. Call callback with error (if provided)
      if (callback && typeof callback === "function") {
        callback({
          success: false,
          message: `Failed to start ${type} call`,
          error: error.message,
          code: "CALL_START_FAILED",
          timestamp: new Date(),
        });
      }

      // 12. Emit error event
      socket.emit("call_error", {
        message: `Failed to start ${type} call`,
        error: error.message,
        code: "CALL_START_FAILED",
        type,
        from: currentUserId,
        to,
        timestamp: new Date(),
      });

      // 13. Log error to audit trail
      await AuditLog.create({
        user: currentUserId,
        action: `${actionName}_failed`,
        targetId: to,
        metadata: {
          error: error.message,
          type,
          roomID,
          socketId: socket.id,
        },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers["user-agent"],
      });

      // 14. Emit error metrics
      io.emit("call_metrics", {
        action: "call_start_failed",
        type,
        from: currentUserId,
        to,
        roomID,
        timestamp: new Date(),
        success: false,
        error: error.message,
      });
    } finally {
      // 15. Clean up lock with delay
      setTimeout(() => {
        if (callCreationLocks.has(lockKey)) {
          const lockData = callCreationLocks.get(lockKey);
          const lockDuration = Date.now() - lockData.timestamp;

          console.log(
            `🔓 Removing call lock: ${lockKey} (held for ${lockDuration}ms)`
          );
          callCreationLocks.delete(lockKey);
        }
      }, 2000);
    }
  };

  // ==================== CALL ANSWER HANDLERS ====================

  // ==================== CALL ANSWER HANDLERS ====================

  const handleCallResponse = async (
    callId,
    roomID,
    type,
    status,
    actionName,
    callback
  ) => {
    try {
      console.log(`📞 ${type} call ${status}:`, {
        userId: currentUserId,
        callId,
        roomID,
      });

      let call = callId
        ? await Call.findById(callId)
        : await Call.findOne({
            roomID,
            participants: currentUserId,
            status: "ringing",
            type,
          });

      if (!call) {
        if (callback) {
          callback({
            success: false,
            message: "Call not found or already ended",
          });
        }
        return socket.emit("call_error", {
          message: "Call not found or already ended",
        });
      }

      const callerId = call.startedBy;

      if (status === "accepted") {
        await call.acceptCall(currentUserId);
      } else if (status === "declined") {
        await call.declineCall(currentUserId);
      }

      // ==================== SỬA LẠI PHẦN NÀY ====================

      // 1. Tạo event data
      const eventData = {
        callId: call._id,
        roomID: call.roomID,
        acceptedBy: currentUserId,
        callerId: callerId,
        status: status === "accepted" ? "ongoing" : status,
        timestamp: new Date(),
        method: "socketio",
        type,
      };

      // 2. Đảm bảo người gọi NHẬN được sự kiện
      // Emit trực tiếp đến người gọi (caller)
      io.to(callerId).emit(`call_${status}`, eventData);

      // Emit type-specific event đến người gọi
      io.to(callerId).emit(`${type}_call_${status}`, {
        ...eventData,
        from: currentUserId, // Ai chấp nhận/từ chối
        to: callerId, // Người nhận thông báo
      });

      // 3. Thông báo cho người chấp nhận (callee)
      socket.emit(`${type}_call_${status}_success`, {
        success: true,
        callId: call._id,
        roomID: call.roomID,
        timestamp: new Date(),
        method: "socketio",
      });

      // 4. Thông báo đến room nếu có người đã join
      io.to(call.roomID).emit(`call_${status}_broadcast`, eventData);

      // ==================== END OF FIX ====================

      // Gọi callback khi thành công
      if (callback && typeof callback === "function") {
        callback({
          success: true,
          callId: call._id,
          status: status,
          message: `Call ${status} successfully`,
          timestamp: new Date(),
        });
      }

      await AuditLog.create({
        user: currentUserId,
        action: actionName,
        targetId: callerId,
        metadata: { callId: call._id, roomID: call.roomID, method: "socketio" },
      });

      console.log(`✅ Call ${call._id} ${status} by ${currentUserId}`);

      // Log để debug
      console.log(`📤 Emitted call_${status} to caller: ${callerId}`);
      console.log(`📤 Emitted ${type}_call_${status} to caller: ${callerId}`);
    } catch (error) {
      console.error(`❌ Error ${status} ${type} call:`, error);

      // Gọi callback khi lỗi
      if (callback && typeof callback === "function") {
        callback({
          success: false,
          error: error.message,
        });
      }

      socket.emit("call_error", {
        message: `Failed to ${status} call`,
        error: error.message,
      });
    }
  };

  // ==================== ROOM MANAGEMENT ====================

  const handleRoomAction = (action, { roomID, callId }, callback) => {
    // THÊM callback parameter
    console.log(`🚪 ${currentUserId} ${action} call room:`, {
      roomID,
      callId: callId ? callId.substring(0, 8) + "..." : "none",
    });

    if (!roomID) {
      const errorMessage = `Missing roomID for ${action}_call_room`;

      // GỌI CALLBACK KHI LỖI
      if (callback && typeof callback === "function") {
        callback({
          success: false,
          error: errorMessage,
        });
      }

      if (action === "leaving") {
        console.warn(`⚠️ ${errorMessage}`);
        return;
      }
      return socket.emit("call_error", {
        message: errorMessage,
      });
    }

    if (action === "joining") {
      socket.join(roomID);
      socket.to(roomID).emit("user_joined_call", {
        userId: currentUserId,
        roomID,
        callId,
        timestamp: new Date(),
        method: "socketio",
      });
      socket.emit("call_room_joined", {
        roomID,
        callId,
        timestamp: new Date(),
        method: "socketio",
      });

      // GỌI CALLBACK KHI THÀNH CÔNG
      if (callback && typeof callback === "function") {
        callback({
          success: true,
          roomID,
          action: "joined",
          message: "Successfully joined call room",
          timestamp: new Date(),
        });
      }
    } else {
      socket.leave(roomID);
      socket.to(roomID).emit("user_left_call", {
        userId: currentUserId,
        roomID,
        callId,
        timestamp: new Date(),
        method: "socketio",
      });
      socket.emit("call_room_left", {
        roomID,
        callId,
        timestamp: new Date(),
        method: "socketio",
      });

      // GỌI CALLBACK KHI THÀNH CÔNG
      if (callback && typeof callback === "function") {
        callback({
          success: true,
          roomID,
          action: "left",
          message: "Successfully left call room",
          timestamp: new Date(),
        });
      }
    }
  };

  // ==================== CALL END HANDLER ====================

  const handleEndCall = async ({ callId, roomID }, callback) => {
    // THÊM callback parameter
    console.log(`📴 ${currentUserId} ending call:`, { callId, roomID });

    try {
      let call = callId
        ? await Call.findById(callId)
        : await Call.findOne({
            roomID,
            participants: currentUserId,
            status: { $in: ["ringing", "ongoing"] },
          });

      if (!call) {
        if (callback && typeof callback === "function") {
          callback({
            success: false,
            message: "Call not found or already ended",
          });
        }
        return socket.emit("call_error", {
          message: "Call not found or already ended",
        });
      }

      await call.endCall(currentUserId);
      console.log(`✅ Call ${call._id} ended by ${currentUserId}`);

      // Notify all participants
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

      // Notify self
      socket.emit("call_ended", {
        callId: call._id,
        endedBy: currentUserId,
        roomID: call.roomID,
        duration: call.duration,
        timestamp: new Date(),
        method: "socketio",
      });

      // GỌI CALLBACK KHI THÀNH CÔNG
      if (callback && typeof callback === "function") {
        callback({
          success: true,
          callId: call._id,
          endedBy: currentUserId,
          duration: call.duration,
          message: "Call ended successfully",
          timestamp: new Date(),
        });
      }

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

      // GỌI CALLBACK KHI LỖI
      if (callback && typeof callback === "function") {
        callback({
          success: false,
          error: error.message,
        });
      }

      socket.emit("call_error", {
        message: "Failed to end call",
        error: error.message,
      });
    }
  };

  const forwardWebRTCMessage = (eventType, data, validationFn) => {
    const { to, roomID, callId } = data;
    const from = currentUserId;

    console.log(`📤 [WebRTC ${eventType}] from ${from} to ${to}`, {
      roomID,
      callId: callId ? callId.substring(0, 8) + "..." : "none",
    });

    if (!to) {
      return socket.emit("call_error", {
        message: `Missing 'to' field for WebRTC ${eventType}`,
      });
    }

    if (validationFn && !validationFn(data)) {
      return socket.emit("call_error", {
        message: `Invalid WebRTC ${eventType} format`,
      });
    }

    io.to(to).emit(eventType === "offer" ? "webrtc_offer" : "webrtc_answer", {
      from,
      [eventType]: data[eventType],
      roomID: roomID || `webrtc_room_${Date.now()}`,
      callId,
      timestamp: new Date(),
    });
  };

  const handleWebRTCAnswerFromCallee = async (data) => {
    const { callId, answer, roomID } = data;
    const calleeId = currentUserId;

    console.log(`📤 [WebRTC Answer] from callee ${calleeId}:`, {
      callId,
      roomID,
      answerType: answer?.type,
    });

    try {
      let call = callId
        ? await Call.findById(callId)
        : await Call.findOne({
            roomID,
            participants: calleeId,
            status: { $in: ["ringing", "ongoing"] },
          });

      if (!call) {
        console.error(`❌ Call not found for answer:`, { callId, roomID });
        return socket.emit("call_error", {
          message: "Call not found",
          event: "webrtc_answer_from_callee",
        });
      }

      const callerId = call.startedBy;
      if (!callerId) {
        return socket.emit("call_error", {
          message: "Caller not found",
          event: "webrtc_answer_from_callee",
        });
      }

      // Update call status
      if (call.status === "ringing") {
        call.status = "ongoing";
        call.answeredAt = new Date();
        if (call.ringingStartedAt) {
          call.ringingDuration = Math.floor(
            (new Date() - call.ringingStartedAt) / 1000
          );
          call.ringingEndedAt = new Date();
        }

        const calleeParticipant = call.participantDetails.find(
          (p) => p.userId === calleeId
        );
        if (calleeParticipant) {
          calleeParticipant.status = "joined";
          calleeParticipant.joinedAt = new Date();
        }

        await call.save();
        console.log(`✅ Call ${call._id} status updated to: ${call.status}`);
      }

      // Save WebRTC answer
      const participant = call.participantDetails.find(
        (p) => p.userId === calleeId
      );
      if (participant) {
        if (!participant.webrtc) participant.webrtc = {};
        participant.webrtc.answer = answer;
        await call.save();
        console.log(`✅ WebRTC answer saved for callee ${calleeId}`);
      }

      // Forward to caller
      io.to(callerId).emit("webrtc_answer_received", {
        callId: call._id,
        roomID: call.roomID,
        from: calleeId,
        answer: answer,
        timestamp: new Date(),
        type: call.type,
      });

      // Confirm to callee
      socket.emit("webrtc_answer_sent", {
        success: true,
        callId: call._id,
        roomID: call.roomID,
        to: callerId,
        timestamp: new Date(),
      });

      // Broadcast accepted
      io.to(call.roomID).emit("call_accepted", {
        callId: call._id,
        roomID: call.roomID,
        acceptedBy: calleeId,
        callerId: callerId,
        timestamp: new Date(),
        type: call.type,
      });

      await AuditLog.create({
        user: calleeId,
        action: "webrtc_answer_sent",
        targetId: callerId,
        metadata: {
          callId: call._id,
          roomID: call.roomID,
          callType: call.type,
          hasAnswer: !!answer,
        },
      });

      console.log(`✅ WebRTC answer forwarded: ${calleeId} → ${callerId}`);
    } catch (error) {
      console.error("❌ Error in webrtc_answer_from_callee:", error);
      socket.emit("call_error", {
        message: "Failed to send WebRTC answer",
        error: error.message,
        event: "webrtc_answer_from_callee",
      });
    }
  };

  const handleWebRTCAnswerReceived = async (data) => {
    const { callId, from, answer, roomID } = data;
    const callerId = currentUserId;

    console.log(`🎯 [WebRTC Answer Received] from ${from}:`, {
      callId,
      roomID,
      answerType: answer?.type,
    });

    try {
      let call = callId
        ? await Call.findById(callId)
        : await Call.findOne({
            roomID,
            startedBy: callerId,
            status: { $in: ["ringing", "ongoing"] },
          });

      if (!call) {
        console.warn(`⚠️ Call not found for answer received:`, {
          callId,
          roomID,
        });
        return;
      }

      // Update call status
      if (call.status === "ringing") {
        call.status = "ongoing";
        call.answeredAt = new Date();
        if (call.ringingStartedAt) {
          call.ringingDuration = Math.floor(
            (new Date() - call.ringingStartedAt) / 1000
          );
          call.ringingEndedAt = new Date();
        }

        const calleeParticipant = call.participantDetails.find(
          (p) => p.userId === from
        );
        if (calleeParticipant) {
          calleeParticipant.status = "joined";
          calleeParticipant.joinedAt = new Date();
        }

        await call.save();
        console.log(`✅ Call ${call._id} status updated to: ${call.status}`);
      }

      // Save answer
      const calleeParticipant = call.participantDetails.find(
        (p) => p.userId === from
      );
      if (calleeParticipant) {
        if (!calleeParticipant.webrtc) calleeParticipant.webrtc = {};
        calleeParticipant.webrtc.answer = answer;
        await call.save();
        console.log(`✅ WebRTC answer saved for callee ${from}`);
      }

      // Confirm to caller
      socket.emit("webrtc_answer_confirmed", {
        success: true,
        callId: call._id,
        roomID: call.roomID,
        from: from,
        answerReceived: true,
        timestamp: new Date(),
      });

      // Broadcast accepted
      io.to(call.roomID).emit("call_accepted", {
        callId: call._id,
        roomID: call.roomID,
        acceptedBy: from,
        callerId: callerId,
        timestamp: new Date(),
        type: call.type,
      });

      console.log(`✅ WebRTC answer processed for call ${callId}`);
    } catch (error) {
      console.error("❌ Error in webrtc_answer_received:", error);
      socket.emit("call_error", {
        message: "Failed to process WebRTC answer",
        error: error.message,
        event: "webrtc_answer_received",
      });
    }
  };

  // ==================== EVENT LISTENERS REGISTRATION ====================

  // Clear existing listeners first
  const eventsToClear = [
    "start_audio_call",
    "start_video_call",
    "audio_call_accepted",
    "video_call_accepted",
    "audio_call_declined",
    "webrtc_offer",
    "webrtc_answer",
    "ice_candidate",
    "join_call_room",
    "leave_call_room",
    "end_call",
    "webrtc_answer_from_callee",
    "webrtc_answer_received",
    "ice_candidate_from_callee",
    "webrtc_offer_from_caller",
    "debug_call_info",
    "test_answer_flow",
  ];

  eventsToClear.forEach((event) => socket.removeAllListeners(event));

  // Call Initiation
  socket.on("start_audio_call", (data, callback) =>
    handleCallStart("audio", data, "start_audio_call", callback)
  );
  socket.on("start_video_call", (data, callback) =>
    handleCallStart("video", data, "start_video_call", callback)
  );

  // Call Responses
  socket.on("audio_call_accepted", (data) =>
    handleCallResponse(
      data.callId,
      data.roomID,
      "audio",
      "accepted",
      "audio_call_accepted"
    )
  );
  socket.on("video_call_accepted", (data) =>
    handleCallResponse(
      data.callId,
      data.roomID,
      "video",
      "accepted",
      "video_call_accepted"
    )
  );
  socket.on("audio_call_declined", (data) =>
    handleCallResponse(
      data.callId,
      data.roomID,
      "audio",
      "declined",
      "audio_call_declined"
    )
  );

  // WebRTC Signaling
  socket.on("webrtc_offer", (data) =>
    forwardWebRTCMessage("offer", data, (d) => d.offer?.type && d.offer?.sdp)
  );
  socket.on("webrtc_answer", (data) =>
    forwardWebRTCMessage("answer", data, (d) => d.answer?.type && d.answer?.sdp)
  );

  socket.on("ice_candidate", (data) => {
    if (!data.to || !data.candidate?.candidate) {
      return socket.emit("call_error", {
        message: "Invalid ICE candidate format",
      });
    }
    io.to(data.to).emit("ice_candidate", {
      from: currentUserId,
      candidate: data.candidate,
      roomID: data.roomID,
      callId: data.callId,
      timestamp: new Date(),
    });
  });

  // WebRTC Advanced Handlers
  socket.on("webrtc_answer_from_callee", handleWebRTCAnswerFromCallee);
  socket.on("webrtc_answer_received", handleWebRTCAnswerReceived);

  socket.on("ice_candidate_from_callee", async (data) => {
    try {
      const call = data.callId
        ? await Call.findById(data.callId)
        : await Call.findOne({
            roomID: data.roomID,
            participants: currentUserId,
          });

      if (!call || !call.startedBy) {
        return socket.emit("call_error", { message: "Call/Caller not found" });
      }

      const participant = call.participantDetails.find(
        (p) => p.userId === currentUserId
      );
      if (participant) {
        if (!participant.webrtc) participant.webrtc = {};
        if (!participant.webrtc.candidates) participant.webrtc.candidates = [];
        participant.webrtc.candidates.push(data.candidate);
        await call.save();
      }

      io.to(call.startedBy).emit("ice_candidate_received", {
        callId: call._id,
        roomID: call.roomID,
        from: currentUserId,
        candidate: data.candidate,
        timestamp: new Date(),
      });

      console.log(
        `✅ ICE candidate forwarded: ${currentUserId} → ${call.startedBy}`
      );
    } catch (error) {
      console.error("❌ Error in ice_candidate_from_callee:", error);
      socket.emit("call_error", {
        message: "Failed to send ICE candidate",
        error: error.message,
      });
    }
  });

  socket.on("webrtc_offer_from_caller", async (data) => {
    try {
      const call = data.callId
        ? await Call.findById(data.callId)
        : await Call.findOne({
            roomID: data.roomID,
            startedBy: currentUserId,
            participants: data.to,
          });

      if (!call) {
        return socket.emit("call_error", { message: "Call not found" });
      }

      const participant = call.participantDetails.find(
        (p) => p.userId === currentUserId
      );
      if (participant) {
        if (!participant.webrtc) participant.webrtc = {};
        participant.webrtc.offer = data.offer;
        await call.save();
        console.log(`✅ WebRTC offer saved for caller ${currentUserId}`);
      }

      io.to(data.to).emit("webrtc_offer_received", {
        callId: call._id,
        roomID: call.roomID,
        from: currentUserId,
        offer: data.offer,
        timestamp: new Date(),
        type: call.type,
      });

      socket.emit("webrtc_offer_sent", {
        success: true,
        callId: call._id,
        roomID: call.roomID,
        to: data.to,
        timestamp: new Date(),
      });

      console.log(`✅ WebRTC offer sent: ${currentUserId} → ${data.to}`);
    } catch (error) {
      console.error("❌ Error in webrtc_offer_from_caller:", error);
      socket.emit("call_error", {
        message: "Failed to send WebRTC offer",
        error: error.message,
      });
    }
  });

  // File: events/call.js
  // THÊM hàm cleanup cho ringing calls quá lâu

  const cleanupStaleCalls = async () => {
    try {
      const staleTime = new Date(Date.now() - 60000); // 1 minute
      const staleCalls = await Call.find({
        status: "ringing",
        ringingStartedAt: { $lt: staleTime },
        callMethod: "socketio",
      });

      for (const call of staleCalls) {
        call.status = "missed";
        call.endedAt = new Date();
        await call.save();

        // Notify participants
        call.participants.forEach((participantId) => {
          io.to(participantId).emit("call_missed", {
            callId: call._id,
            roomID: call.roomID,
            reason: "timeout",
            timestamp: new Date(),
          });
        });
      }

      if (staleCalls.length > 0) {
        console.log(`🧹 Cleaned up ${staleCalls.length} stale calls`);
      }
    } catch (error) {
      console.error("❌ Cleanup error:", error);
    }
  };

  // Chạy cleanup mỗi 30 giây
  setInterval(cleanupStaleCalls, 30000);

  // Room Management
  socket.on("join_call_room", (data, callback) =>
    handleRoomAction("joining", data, callback)
  );
  socket.on("leave_call_room", (data, callback) =>
    handleRoomAction("leaving", data, callback)
  );

  // Call End
  socket.on("end_call", handleEndCall);

  // Debug & Utility
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
        startedBy: call.startedBy,
        answeredAt: call.answeredAt,
        ringingDuration: call.ringingDuration,
        participantDetails: call.participantDetails.map((p) => ({
          userId: p.userId,
          status: p.status,
          webrtc: p.webrtc
            ? {
                hasOffer: !!p.webrtc.offer,
                hasAnswer: !!p.webrtc.answer,
                candidates: p.webrtc.candidates?.length || 0,
              }
            : null,
        })),
      }));

      socket.emit("debug_call_info_response", {
        userId: currentUserId,
        activeCalls: callInfo,
        timestamp: new Date(),
      });

      console.log(
        `🔍 Debug call info for ${currentUserId}:`,
        callInfo.length,
        "active calls"
      );
    } catch (error) {
      console.error("❌ Error in debug_call_info:", error);
      socket.emit("debug_call_info_error", { error: error.message });
    }
  });

  // Disconnect Handler
  socket.on("disconnect", () => {
    console.log(`🔊 [Call Events] Disconnected for user: ${currentUserId}`);

    const rooms = Array.from(socket.rooms);
    rooms.forEach((roomId) => {
      if (roomId !== socket.id) {
        socket.to(roomId).emit("user_disconnected_from_call", {
          userId: currentUserId,
          roomId,
          timestamp: new Date(),
          method: "socketio",
        });
      }
    });
  });

  console.log(`✅ All call handlers registered for user: ${currentUserId}`);
};
