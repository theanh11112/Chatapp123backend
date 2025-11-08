// socket/events/call.js
const User = require("../../models/user");
const AudioCall = require("../../models/audioCall");
const VideoCall = require("../../models/videoCall");

module.exports = (socket, io) => {

  const updateCallStatus = async (Model, from, to, statusObj) => {
    await Model.findOneAndUpdate(
      { participants: { $size: 2, $all: [to, from] } },
      { ...statusObj }
    );
  };

  // ---------------- Audio Call ----------------
  socket.on("start_audio_call", async ({ from, to, roomID }) => {
    const toUser = await User.findById(to);
    const fromUser = await User.findById(from);
    io.to(toUser.socket_id).emit("audio_call_notification", { from: fromUser, roomID });
  });

  socket.on("audio_call_accepted", async ({ from, to }) => {
    await updateCallStatus(AudioCall, from, to, { verdict: "Accepted" });
    const fromUser = await User.findById(from);
    io.to(fromUser.socket_id).emit("audio_call_accepted", { from, to });
  });

  socket.on("audio_call_denied", async ({ from, to }) => {
    await updateCallStatus(AudioCall, from, to, { verdict: "Denied", status: "Ended", endedAt: Date.now() });
    const fromUser = await User.findById(from);
    io.to(fromUser.socket_id).emit("audio_call_denied", { from, to });
  });

  socket.on("audio_call_not_picked", async ({ from, to }) => {
    await updateCallStatus(AudioCall, from, to, { verdict: "Missed", status: "Ended", endedAt: Date.now() });
    const toUser = await User.findById(to);
    io.to(toUser.socket_id).emit("audio_call_missed", { from, to });
  });

  // ---------------- Video Call ----------------
  socket.on("start_video_call", async ({ from, to, roomID }) => {
    const toUser = await User.findById(to);
    const fromUser = await User.findById(from);
    io.to(toUser.socket_id).emit("video_call_notification", { from: fromUser, roomID });
  });

  socket.on("video_call_accepted", async ({ from, to }) => {
    await updateCallStatus(VideoCall, from, to, { verdict: "Accepted" });
    const fromUser = await User.findById(from);
    io.to(fromUser.socket_id).emit("video_call_accepted", { from, to });
  });

  socket.on("video_call_denied", async ({ from, to }) => {
    await updateCallStatus(VideoCall, from, to, { verdict: "Denied", status: "Ended", endedAt: Date.now() });
    const fromUser = await User.findById(from);
    io.to(fromUser.socket_id).emit("video_call_denied", { from, to });
  });

  socket.on("video_call_not_picked", async ({ from, to }) => {
    await updateCallStatus(VideoCall, from, to, { verdict: "Missed", status: "Ended", endedAt: Date.now() });
    const toUser = await User.findById(to);
    io.to(toUser.socket_id).emit("video_call_missed", { from, to });
  });

};
