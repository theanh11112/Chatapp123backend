// socket/events/chat.js
const User = require("../../models/user");
const FriendRequest = require("../../models/friendRequest");
const OneToOneMessage = require("../../models/OneToOneMessage");

module.exports = (socket, io) => {
  // ---------------- Friend Request ----------------
  socket.on("friend_request", async (data) => {
    try {
      const { from, to } = data;
      await FriendRequest.create({ sender: from, recipient: to });

      const toUser = await User.findById(to);
      const fromUser = await User.findById(from);

      io.to(toUser.socket_id).emit("new_friend_request", { message: "New friend request received" });
      io.to(fromUser.socket_id).emit("request_sent", { message: "Request sent successfully!" });
    } catch (err) {
      console.error("Error friend_request:", err);
    }
  });

  socket.on("accept_request", async (data) => {
    try {
      const request_doc = await FriendRequest.findById(data.request_id);
      const sender = await User.findById(request_doc.sender);
      const receiver = await User.findById(request_doc.recipient);

      sender.friends.push(receiver._id);
      receiver.friends.push(sender._id);

      await sender.save();
      await receiver.save();

      await FriendRequest.findByIdAndDelete(data.request_id);

      io.to(sender.socket_id).emit("request_accepted", { message: "Friend Request Accepted" });
      io.to(receiver.socket_id).emit("request_accepted", { message: "Friend Request Accepted" });
    } catch (err) {
      console.error("Error accept_request:", err);
    }
  });

  // ---------------- Direct Conversations ----------------
  socket.on("get_direct_conversations", async ({ user_id }, callback) => {
    try {
      const conversations = await OneToOneMessage.find({ participants: { $all: [user_id] } })
        .populate("participants", "firstName lastName avatar _id email status");
      callback(conversations);
    } catch (err) {
      console.error(err);
      callback([]);
    }
  });

  socket.on("start_conversation", async ({ from, to }) => {
    try {
      let conversation = await OneToOneMessage.findOne({ participants: { $size: 2, $all: [from, to] } })
        .populate("participants", "firstName lastName _id email status");

      if (!conversation) {
        conversation = await OneToOneMessage.create({ participants: [from, to] });
        conversation = await OneToOneMessage.findById(conversation._id)
          .populate("participants", "firstName lastName _id email status");
      }

      socket.emit("start_chat", conversation);
    } catch (err) {
      console.error(err);
    }
  });

  // ---------------- Text Message ----------------
  socket.on("text_message", async (data) => {
    try {
      const { conversation_id, from, to, message, type } = data;
      const newMessage = { from, to, type, text: message, created_at: Date.now() };

      const chat = await OneToOneMessage.findById(conversation_id);
      chat.messages.push(newMessage);
      await chat.save();

      const toUser = await User.findById(to);
      const fromUser = await User.findById(from);

      io.to(toUser.socket_id).emit("new_message", { conversation_id, message: newMessage });
      io.to(fromUser.socket_id).emit("new_message", { conversation_id, message: newMessage });
    } catch (err) {
      console.error("Error text_message:", err);
    }
  });

};
