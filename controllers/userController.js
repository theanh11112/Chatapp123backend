const AudioCall = require("../models/audioCall");
const FriendRequest = require("../models/friendRequest");
const User = require("../models/user");
const VideoCall = require("../models/videoCall");
const catchAsync = require("../utils/catchAsync");
const filterObj = require("../utils/filterObj");
const { generateToken04 } = require("./zegoServerAssistant");

const appID = process.env.ZEGO_APP_ID;
const serverSecret = process.env.ZEGO_SERVER_SECRET;

// -------------------- User routes --------------------
exports.getMe = catchAsync(async (req, res) => {
  res.status(200).json({ status: "success", data: req.user });
});

exports.updateMe = catchAsync(async (req, res) => {
  const filteredBody = filterObj(req.body, "firstName", "lastName", "about", "avatar");
  const userDoc = await User.findByIdAndUpdate(req.user._id, filteredBody, { new: true });
  res.status(200).json({ status: "success", data: userDoc, message: "User updated successfully" });
});

exports.getUsers = catchAsync(async (req, res) => {
  const all_users = await User.find({ verified: true }).select("firstName lastName _id");
  const remaining_users = all_users.filter(
    user => !req.user.friends.includes(user._id) && user._id.toString() !== req.user._id.toString()
  );
  res.status(200).json({ status: "success", data: remaining_users, message: "Users found successfully!" });
});

exports.getAllVerifiedUsers = catchAsync(async (req, res) => {
  const all_users = await User.find({ verified: true }).select("firstName lastName _id");
  const remaining_users = all_users.filter(user => user._id.toString() !== req.user._id.toString());
  res.status(200).json({ status: "success", data: remaining_users, message: "Users found successfully!" });
});

exports.getRequests = catchAsync(async (req, res) => {
  const requests = await FriendRequest.find({ recipient: req.user._id }).populate("sender").select("_id firstName lastName");
  res.status(200).json({ status: "success", data: requests, message: "Requests found successfully!" });
});

exports.getFriends = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).populate("friends", "_id firstName lastName");
  res.status(200).json({ status: "success", data: user.friends, message: "Friends found successfully!" });
});

// -------------------- Zego token --------------------
exports.generateZegoToken = catchAsync(async (req, res) => {
  const { userId, room_id } = req.body;
  const effectiveTimeInSeconds = 3600;
  const payloadObject = { room_id, privilege: { 1: 1, 2: 1 }, stream_id_list: null };
  const token = generateToken04(appID * 1, userId, serverSecret, effectiveTimeInSeconds, JSON.stringify(payloadObject));
  res.status(200).json({ status: "success", message: "Token generated successfully", token });
});

// -------------------- Call features --------------------
exports.startAudioCall = catchAsync(async (req, res) => {
  const from = req.user._id;
  const to = req.body.id;
  const [from_user, to_user] = await Promise.all([User.findById(from), User.findById(to)]);
  const new_audio_call = await AudioCall.create({ participants: [from, to], from, to, status: "Ongoing" });
  res.status(200).json({ data: { from: to_user, roomID: new_audio_call._id, streamID: to, userID: from, userName: from_user.firstName } });
});

exports.startVideoCall = catchAsync(async (req, res) => {
  const from = req.user._id;
  const to = req.body.id;
  const [from_user, to_user] = await Promise.all([User.findById(from), User.findById(to)]);
  const new_video_call = await VideoCall.create({ participants: [from, to], from, to, status: "Ongoing" });
  res.status(200).json({ data: { from: to_user, roomID: new_video_call._id, streamID: to, userID: from, userName: from_user.firstName } });
});

exports.getCallLogs = catchAsync(async (req, res) => {
  const user_id = req.user._id;
  const call_logs = [];
  const audio_calls = await AudioCall.find({ participants: { $all: [user_id] } }).populate("from to");
  const video_calls = await VideoCall.find({ participants: { $all: [user_id] } }).populate("from to");

  const processCalls = (calls, type) => {
    calls.forEach(call => {
      const missed = call.verdict !== "Accepted";
      const isOutgoing = call.from._id.toString() === user_id.toString();
      const other_user = isOutgoing ? call.to : call.from;
      call_logs.push({ id: call._id, img: other_user.avatar, name: other_user.firstName, online: true, incoming: !isOutgoing, missed, type });
    });
  };

  processCalls(audio_calls, "audio");
  processCalls(video_calls, "video");
  res.status(200).json({ status: "success", message: "Call logs found successfully!", data: call_logs });
});

// -------------------- Role-based routes --------------------
exports.roleTest = (req, res) => {
  const roles = req.kauth.grant.access_token.content.realm_access?.roles || [];
  res.status(200).json({ roles });
};
