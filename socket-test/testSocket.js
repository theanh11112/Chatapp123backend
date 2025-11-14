const { io } = require("socket.io-client");
const axios = require("axios");

const SERVER_URL = "http://localhost:3001";
const KEYCLOAK_URL = "http://localhost:8080";
const REALM = "chat-app";
const CLIENT_ID = "my-react-app";
const CLIENT_SECRET = "bFUtkzEs7nOV0DPBcRnD9ibVhiSYlkqF";

const users = [
  { username: "hoangngan", password: "1234", keycloakId: "08c5d8e7-6e60-42ae-a463-956015ead925" },
  { username: "nguyenan", password: "1234", keycloakId: "5065e7a7-9887-45ac-861a-8bca08bc459d" },
];

async function getToken(username, password) {
  const res = await axios.post(
    `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
    new URLSearchParams({ grant_type: "password", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, username, password }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return res.data.access_token;
}

(async () => {
  const sockets = await Promise.all(
    users.map(async (u) => {
      const token = await getToken(u.username, u.password);
      const socket = io(SERVER_URL, { auth: { token } });

      socket.on("connect", () => console.log(`✅ ${u.username} connected, socketId: ${socket.id}`));
      socket.on("new_message", (data) => console.log(`📩 ${u.username} received message:`, data));
      socket.on("typing_start", (data) => console.log(`✍️ ${u.username} sees typing:`, data));
      socket.on("typing_stop", (data) => console.log(`🛑 ${u.username} sees stop typing:`, data));
      socket.on("new_friend_request", (data) => console.log(`👥 ${u.username} received friend request:`, data));
      socket.on("request_sent", (data) => console.log(`✅ ${u.username} friend request sent:`, data));
      socket.on("request_accepted", (data) => console.log(`🎉 ${u.username} friend request accepted:`, data));
      socket.on("audio_call_notification", (data) => console.log(`🎧 ${u.username} incoming audio call:`, data));
      socket.on("video_call_notification", (data) => console.log(`📹 ${u.username} incoming video call:`, data));
      socket.on("audio_call_accepted", (data) => console.log(`🎧 ${u.username} audio call accepted:`, data));
      socket.on("video_call_accepted", (data) => console.log(`📹 ${u.username} video call accepted:`, data));

      socket.on("disconnect", () => console.log(`❌ ${u.username} disconnected`));
      socket.on("connect_error", (err) => console.error(`❌ ${u.username} connect error:`, err.message));

      return socket;
    })
  );

  const [userA, userB] = sockets;

  // ---------------- Test Chat ----------------
  setTimeout(() => {
    console.log("🚀 HoangNgan sending text message");
    userA.emit("text_message", { conversation_id: null, to: users[1].keycloakId, message: "Hello Bob! From HoangNgan", type: "text" }, (res) => {
      console.log("📬 HoangNgan callback:", res);
    });

    console.log("🚀 NguyenAn sending text message");
    userB.emit("text_message", { conversation_id: null, to: users[0].keycloakId, message: "Hello HoangNgan! From Bob", type: "text" }, (res) => {
      console.log("📬 NguyenAn callback:", res);
    });
  }, 1000);

  // ---------------- Test Typing ----------------
  setTimeout(() => {
    console.log("✍️ HoangNgan typing start");
    userA.emit("typing_start", { roomId: users[1].keycloakId });

    setTimeout(() => {
      console.log("🛑 HoangNgan typing stop");
      userA.emit("typing_stop", { roomId: users[1].keycloakId });
    }, 1000);
  }, 3000);

  // ---------------- Test Friend Request ----------------
  setTimeout(() => {
    console.log("👥 HoangNgan sends friend request to NguyenAn");
    userA.emit("friend_request", { to: users[1].keycloakId });

    setTimeout(() => {
      console.log("🎉 NguyenAn accepts friend request");
      // Normally you'd need request_id from DB, here just simulate with dummy id
      userB.emit("accept_request", { request_id: "dummy_request_id" });
    }, 2000);
  }, 5000);

  // ---------------- Test Audio/Video Call ----------------
  setTimeout(() => {
    console.log("🎧 HoangNgan starts audio call to NguyenAn");
    userA.emit("start_audio_call", { to: users[1].keycloakId, roomID: "room_audio_123" });

    setTimeout(() => {
      console.log("📹 NguyenAn starts video call to HoangNgan");
      userB.emit("start_video_call", { to: users[0].keycloakId, roomID: "room_video_456" });
    }, 2000);
  }, 9000);
})();
