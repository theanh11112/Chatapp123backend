// File: models/OneToOneMessage.helper.js
const OneToOneMessage = require("./OneToOneMessage");
const { v4: uuidv4 } = require("uuid");

/**
 * Thêm tin nhắn mới vào cuộc trò chuyện, tự tạo conversation nếu chưa có
 * @param {string[]} participants
 * @param {Object} messageData - { from, to, type, content, attachments }
 */
async function pushMessage(participants, messageData) {
  let chat = await OneToOneMessage.findOne({
    participants: { $all: participants, $size: participants.length },
  });

  if (!chat) {
    chat = new OneToOneMessage({ participants, messages: [] });
  }

  // Tạo id cho message nếu chưa có
  if (!messageData._id) messageData._id = uuidv4();

  chat.messages.push(messageData);
  await chat.save();

  return chat;
}

module.exports = { pushMessage };
