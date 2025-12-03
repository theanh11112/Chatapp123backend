// cleanup-calls.js - CLEAN UP EXISTING CALLS BEFORE TESTING
const { io } = require("socket.io-client");
const axios = require("axios");

const SERVER_URL = "http://localhost:3001";
const KEYCLOAK_URL = "http://localhost:8080";
const REALM = "chat-app";
const CLIENT_ID = "my-react-app";
const CLIENT_SECRET = "bFUtkzEs7nOV0DPBcRnD9ibVhiSYlkqF";

const users = [
  {
    username: "hoangngan",
    password: "1234",
    keycloakId: "f5dcb70a-4b2e-4f9c-a17f-3015cb6aed42",
  },
  {
    username: "honghao",
    password: "1234",
    keycloakId: "ba025aa5-6cfb-463c-b245-e94472081d45",
  },
];

async function getToken(username, password) {
  try {
    const res = await axios.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        username,
        password,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return res.data.access_token;
  } catch (error) {
    console.error(`❌ Token error for ${username}:`, error.message);
    throw error;
  }
}

async function cleanupExistingCalls() {
  console.log("=== 🧹 CLEANING UP EXISTING CALLS ===\n");

  try {
    // Get token for hoangngan (caller)
    const token = await getToken(users[0].username, users[0].password);

    // Connect socket
    const socket = io(SERVER_URL, {
      auth: { token },
      transports: ["websocket"],
    });

    await new Promise((resolve, reject) => {
      socket.on("connect", () => {
        console.log(`✅ Connected: ${socket.id}`);

        // Get debug info to see existing calls
        console.log("🔍 Getting debug info about existing calls...");
        socket.emit("debug_call_info");

        socket.once("debug_call_info_response", (data) => {
          console.log("\n📊 Existing calls found:");
          const activeCalls = data.activeCalls || [];

          if (activeCalls.length === 0) {
            console.log("✅ No active calls found");
            socket.disconnect();
            resolve();
            return;
          }

          console.log(`Found ${activeCalls.length} active call(s):`);
          activeCalls.forEach((call, index) => {
            console.log(
              `${index + 1}. Call ID: ${call.id?.substring(0, 8) || "unknown"}`
            );
            console.log(`   Type: ${call.type}`);
            console.log(`   Status: ${call.status}`);
            console.log(`   Room: ${call.roomID}`);
            console.log(
              `   Participants: ${call.participants?.join(", ") || "none"}`
            );
          });

          // End all active calls
          console.log("\n📴 Ending all active calls...");
          activeCalls.forEach((call) => {
            if (call.roomID) {
              console.log(`Ending call in room: ${call.roomID}`);
              socket.emit("end_call", { roomID: call.roomID });
            }
          });

          // Wait a bit for calls to end
          setTimeout(() => {
            console.log("\n✅ Cleanup completed");
            socket.disconnect();
            resolve();
          }, 2000);
        });

        // Timeout for debug info
        setTimeout(() => {
          console.log("⚠️ No debug info received, trying direct cleanup...");
          socket.disconnect();
          resolve();
        }, 5000);
      });

      socket.on("connect_error", (err) => {
        console.error("❌ Connection error:", err.message);
        reject(err);
      });

      setTimeout(() => {
        console.log("⚠️ Connection timeout");
        reject(new Error("Connection timeout"));
      }, 10000);
    });
  } catch (error) {
    console.error("❌ Cleanup failed:", error.message);
    throw error;
  }
}

// Run cleanup
cleanupExistingCalls()
  .then(() => {
    console.log("\n✅ Ready for new call tests!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Cleanup failed");
    process.exit(1);
  });
