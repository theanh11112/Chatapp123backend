// events/call.js
const User = require("../../models/user");
const Call = require("../../models/call");
const AuditLog = require("../../models/auditLog");

module.exports = (socket, io) => {
  const currentUserId = socket.user?.id;

  const updateCallStatus = async (from, to, type, statusObj) => {
    await Call.findOneAndUpdate(
      { participants: { $size: 2, $all: [to, from] }, type },
      { ...statusObj }
    );
  };

  // ---------------- Audio Call ----------------
  socket.on("start_audio_call", async ({ to, roomID }) => {
    const from = currentUserId;
    const toUser = await User.findById(to);
    const fromUser = await User.findById(from);

    await Call.create({
      type: "audio",
      participants: [from, to],
      room: roomID,
      status: "Ongoing",
    });

    if (toUser?.socketId) io.to(toUser.socketId).emit("audio_call_notification", { from: fromUser, roomID });
    await AuditLog.create({ user: from, action: "start_audio_call", targetId: to });
  });

  ["accepted", "denied", "not_picked"].forEach((event) => {
    socket.on(`audio_call_${event}`, async ({ from, to }) => {
      let update = {};
      if (event === "accepted") update = { verdict: "Accepted" };
      else if (event === "denied") update = { verdict: "Denied", status: "Ended", endedAt: Date.now() };
      else if (event === "not_picked") update = { verdict: "Missed", status: "Ended", endedAt: Date.now() };

      await updateCallStatus(from, to, "audio", update);

      const targetUser = await User.findById(event === "not_picked" ? to : from);
      if (targetUser?.socketId) io.to(targetUser.socketId).emit(`audio_call_${event === "not_picked" ? "missed" : event}`, { from, to });

      await AuditLog.create({ user: event === "not_picked" ? from : to, action: `audio_call_${event}`, targetId: event === "not_picked" ? to : from });
    });
  });

  // ---------------- Video Call ----------------
  socket.on("start_video_call", async ({ to, roomID }) => {
    const from = currentUserId;
    const toUser = await User.findById(to);
    const fromUser = await User.findById(from);

    await Call.create({
      type: "video",
      participants: [from, to],
      room: roomID,
      status: "Ongoing",
    });

    if (toUser?.socketId) io.to(toUser.socketId).emit("video_call_notification", { from: fromUser, roomID });
    await AuditLog.create({ user: from, action: "start_video_call", targetId: to });
  });

  ["accepted", "denied", "not_picked"].forEach((event) => {
    socket.on(`video_call_${event}`, async ({ from, to }) => {
      let update = {};
      if (event === "accepted") update = { verdict: "Accepted" };
      else if (event === "denied") update = { verdict: "Denied", status: "Ended", endedAt: Date.now() };
      else if (event === "not_picked") update = { verdict: "Missed", status: "Ended", endedAt: Date.now() };

      await updateCallStatus(from, to, "video", update);

      const targetUser = await User.findById(event === "not_picked" ? to : from);
      if (targetUser?.socketId) io.to(targetUser.socketId).emit(`video_call_${event === "not_picked" ? "missed" : event}`, { from, to });

      await AuditLog.create({ user: event === "not_picked" ? from : to, action: `video_call_${event}`, targetId: event === "not_picked" ? to : from });
    });
  });
};
