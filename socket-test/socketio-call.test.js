// test/socketio-call.test.js
const request = require("supertest");
const { describe, it, before, after } = require("mocha");
const { expect } = require("chai");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Mock Socket.IO server
const { createServer } = require("http");
const { Server } = require("socket.io");
const Client = require("socket.io-client");

describe("Socket.IO Audio/Video Call Backend Tests", function () {
  this.timeout(10000);

  let app, server, io;
  let socketClient1, socketClient2;
  let adminToken, user1Token, user2Token;
  let user1Id, user2Id;
  let createdCallId;

  // Mock data
  const testUsers = {
    admin: {
      keycloakId: "test-admin-id",
      username: "testadmin",
      email: "admin@test.com",
      role: "admin",
    },
    user1: {
      keycloakId: "test-user1-id",
      username: "testuser1",
      email: "user1@test.com",
      role: "user",
    },
    user2: {
      keycloakId: "test-user2-id",
      username: "testuser2",
      email: "user2@test.com",
      role: "user",
    },
  };

  before(async function () {
    // Setup test server
    const express = require("express");
    const { setupSocketIO } = require("../socket/setup");

    app = express();
    server = createServer(app);

    // Setup Socket.IO
    io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // Setup Socket.IO events
    require("../events/call")(io);

    // Setup middleware for testing
    app.use(express.json());

    // Mock authentication middleware for testing
    app.use((req, res, next) => {
      // Skip auth for testing
      req.user = testUsers.user1; // Default to user1
      next();
    });

    // Mount call routes
    const callRoutes = require("../routes/callRoutes");
    app.use("/api/call", callRoutes({}));

    // Generate test tokens
    adminToken = jwt.sign(testUsers.admin, "test-secret");
    user1Token = jwt.sign(testUsers.user1, "test-secret");
    user2Token = jwt.sign(testUsers.user2, "test-secret");

    // Start server
    await new Promise((resolve) => server.listen(3001, resolve));

    // Connect Socket.IO clients
    socketClient1 = new Client("http://localhost:3001");
    socketClient2 = new Client("http://localhost:3001");

    await Promise.all([
      new Promise((resolve) => socketClient1.on("connect", resolve)),
      new Promise((resolve) => socketClient2.on("connect", resolve)),
    ]);

    // Mock user data in sockets
    socketClient1.user = testUsers.user1;
    socketClient2.user = testUsers.user2;

    // Register sockets with server
    io.on("connection", (socket) => {
      if (socket.handshake.auth.token === user1Token) {
        socket.user = testUsers.user1;
      } else if (socket.handshake.auth.token === user2Token) {
        socket.user = testUsers.user2;
      }
    });
  });

  after(async function () {
    // Cleanup
    if (socketClient1) socketClient1.disconnect();
    if (socketClient2) socketClient2.disconnect();
    if (server) await server.close();

    // Clean database
    const Call = require("../models/call");
    const User = require("../models/user");

    await Call.deleteMany({});
    await User.deleteMany({
      keycloakId: { $in: ["test-admin-id", "test-user1-id", "test-user2-id"] },
    });
  });

  describe("1. Direct Audio Call Tests", function () {
    it("should start a direct audio call via Socket.IO", function (done) {
      const roomID = `audio_room_${Date.now()}`;

      // User1 starts call to User2
      const callData = {
        to: testUsers.user2.keycloakId,
        roomID: roomID,
      };

      socketClient1.emit("start_audio_call", callData);

      // User2 should receive notification
      socketClient2.once("audio_call_notification", (data) => {
        try {
          expect(data).to.have.property("from", testUsers.user1.keycloakId);
          expect(data).to.have.property("to", testUsers.user2.keycloakId);
          expect(data).to.have.property("roomID", roomID);
          expect(data).to.have.property("type", "audio");
          expect(data).to.have.property("callMethod", "socketio");
          done();
        } catch (error) {
          done(error);
        }
      });

      // User1 should receive confirmation
      socketClient1.once("audio_call_started", (data) => {
        expect(data).to.have.property("to", testUsers.user2.keycloakId);
        expect(data).to.have.property("roomID", roomID);
      });
    });

    it("should accept an audio call via Socket.IO", function (done) {
      const roomID = `audio_accept_${Date.now()}`;
      let callId;

      // User1 starts call
      socketClient1.emit("start_audio_call", {
        to: testUsers.user2.keycloakId,
        roomID: roomID,
      });

      socketClient2.once("audio_call_notification", (data) => {
        callId = data.callId;

        // User2 accepts the call
        socketClient2.emit("audio_call_accepted", {
          from: testUsers.user1.keycloakId,
          to: testUsers.user2.keycloakId,
          roomID: roomID,
          callId: callId,
        });
      });

      // User1 should receive acceptance notification
      socketClient1.once("audio_call_accepted", (data) => {
        try {
          expect(data).to.have.property("from", testUsers.user1.keycloakId);
          expect(data).to.have.property("to", testUsers.user2.keycloakId);
          expect(data).to.have.property("roomID", roomID);
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    it("should decline an audio call via Socket.IO", function (done) {
      const roomID = `audio_decline_${Date.now()}`;

      socketClient1.emit("start_audio_call", {
        to: testUsers.user2.keycloakId,
        roomID: roomID,
      });

      socketClient2.once("audio_call_notification", (data) => {
        // User2 declines the call
        socketClient2.emit("audio_call_denied", {
          from: testUsers.user1.keycloakId,
          to: testUsers.user2.keycloakId,
          roomID: roomID,
          callId: data.callId,
        });
      });

      socketClient1.once("audio_call_denied", (data) => {
        try {
          expect(data).to.have.property("status", "denied");
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });

  describe("2. Direct Video Call Tests", function () {
    it("should start a direct video call via Socket.IO", function (done) {
      const roomID = `video_room_${Date.now()}`;

      socketClient1.emit("start_video_call", {
        to: testUsers.user2.keycloakId,
        roomID: roomID,
      });

      socketClient2.once("video_call_notification", (data) => {
        try {
          expect(data).to.have.property("type", "video");
          expect(data).to.have.property("callMethod", "socketio");
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });

  describe("3. WebRTC Signaling Tests", function () {
    it("should exchange WebRTC offer/answer via Socket.IO", function (done) {
      const roomID = `webrtc_${Date.now()}`;
      const testOffer = { type: "offer", sdp: "test-sdp" };
      const testAnswer = { type: "answer", sdp: "test-answer-sdp" };

      // Setup listener for answer first
      socketClient1.once("webrtc_answer", (data) => {
        try {
          expect(data).to.have.property("from", testUsers.user2.keycloakId);
          expect(data).to.have.property("answer", testAnswer);
          done();
        } catch (error) {
          done(error);
        }
      });

      // User1 sends offer to User2
      socketClient1.emit("webrtc_offer", {
        to: testUsers.user2.keycloakId,
        offer: testOffer,
        roomID: roomID,
      });

      // User2 receives offer and sends answer
      socketClient2.once("webrtc_offer", (data) => {
        socketClient2.emit("webrtc_answer", {
          to: testUsers.user1.keycloakId,
          answer: testAnswer,
          roomID: roomID,
        });
      });
    });

    it("should exchange ICE candidates via Socket.IO", function (done) {
      const roomID = `ice_${Date.now()}`;
      const testCandidate = {
        candidate: "candidate:1",
        sdpMid: "0",
        sdpMLineIndex: 0,
      };

      socketClient1.once("ice_candidate", (data) => {
        try {
          expect(data).to.have.property("candidate", testCandidate);
          done();
        } catch (error) {
          done(error);
        }
      });

      socketClient2.emit("ice_candidate", {
        to: testUsers.user1.keycloakId,
        candidate: testCandidate,
        roomID: roomID,
      });
    });
  });

  describe("4. Call Room Management Tests", function () {
    it("should join and leave call rooms", function (done) {
      const roomID = `room_mgmt_${Date.now()}`;

      // User1 joins room
      socketClient1.emit("join_call_room", { roomID });

      socketClient1.once("call_room_joined", (data) => {
        try {
          expect(data).to.have.property("roomID", roomID);

          // User2 should be notified when joining
          socketClient2.once("user_joined_call", (data) => {
            expect(data.userId).to.equal(testUsers.user1.keycloakId);

            // User1 leaves room
            socketClient1.emit("leave_call_room", { roomID });

            socketClient2.once("user_left_call", (data) => {
              expect(data.userId).to.equal(testUsers.user1.keycloakId);
              done();
            });
          });

          // User2 joins same room
          socketClient2.emit("join_call_room", { roomID });
        } catch (error) {
          done(error);
        }
      });
    });
  });

  describe("5. Call Controls Tests", function () {
    it("should handle mute/unmute audio", function (done) {
      const roomID = `mute_test_${Date.now()}`;

      socketClient1.emit("join_call_room", { roomID });
      socketClient2.emit("join_call_room", { roomID });

      setTimeout(() => {
        socketClient2.once("user_audio_mute_changed", (data) => {
          try {
            expect(data).to.have.property("userId", testUsers.user1.keycloakId);
            expect(data).to.have.property("isMuted", true);
            done();
          } catch (error) {
            done(error);
          }
        });

        // User1 mutes audio
        socketClient1.emit("toggle_audio_mute", {
          roomID: roomID,
          isMuted: true,
        });
      }, 100);
    });

    it("should handle video toggle", function (done) {
      const roomID = `video_toggle_${Date.now()}`;

      socketClient1.emit("join_call_room", { roomID });
      socketClient2.emit("join_call_room", { roomID });

      setTimeout(() => {
        socketClient2.once("user_video_changed", (data) => {
          try {
            expect(data).to.have.property("isVideoOn", false);
            done();
          } catch (error) {
            done(error);
          }
        });

        socketClient1.emit("toggle_video", {
          roomID: roomID,
          isVideoOn: false,
        });
      }, 100);
    });
  });

  describe("6. REST API Endpoints Tests", function () {
    it("should get Socket.IO configuration", function (done) {
      request(app)
        .get("/api/call/socketio-config")
        .set("Authorization", `Bearer ${user1Token}`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body).to.have.property("audioMethod", "socketio");
          expect(res.body).to.have.property(
            "userId",
            testUsers.user1.keycloakId
          );
          done();
        });
    });

    it("should start audio call via REST API", function (done) {
      const roomID = `rest_audio_${Date.now()}`;

      request(app)
        .post("/api/call/start-audio-call")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          to: testUsers.user2.keycloakId,
          roomID: roomID,
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body).to.have.property("callMethod", "socketio");
          expect(res.body).to.have.property("roomID", roomID);

          createdCallId = res.body.callId;
          done();
        });
    });

    it("should get call logs via REST API", function (done) {
      request(app)
        .post("/api/call/call-logs")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          limit: 10,
          skip: 0,
          callMethod: "socketio",
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body).to.have.property("calls").that.is.an("array");
          expect(res.body).to.have.property("callMethod", "socketio");
          done();
        });
    });

    it("should update call status via REST API", function (done) {
      if (!createdCallId) return done(new Error("No call created"));

      request(app)
        .post("/api/call/update-call-status")
        .set("Authorization", `Bearer ${user2Token}`)
        .send({
          callId: createdCallId,
          status: "accepted",
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body.status).to.equal("ongoing");
          done();
        });
    });
  });

  describe("7. Error Handling Tests", function () {
    it("should handle missing required fields", function (done) {
      socketClient1.emit("start_audio_call", {});

      socketClient1.once("call_error", (data) => {
        try {
          expect(data).to.have.property("message");
          expect(data.message).to.include("Missing required fields");
          done();
        } catch (error) {
          done(error);
        }
      });
    });

    it("should handle non-existent user call", function (done) {
      socketClient1.emit("start_audio_call", {
        to: "non-existent-user",
        roomID: "test-room",
      });

      socketClient1.once("call_error", (data) => {
        try {
          expect(data.message).to.include("users not found");
          done();
        } catch (error) {
          done(error);
        }
      });
    });
  });

  describe("8. Test Endpoints Tests", function () {
    it("should send test notification", function (done) {
      request(app)
        .post("/api/call/test-notification")
        .set("Authorization", `Bearer ${user1Token}`)
        .send({
          targetUserId: testUsers.user2.keycloakId,
        })
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body).to.have.property("message");
          done();
        });
    });

    it("should get active socket connections", function (done) {
      request(app)
        .get("/api/call/active-sockets")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body).to.have.property("socketServer");
          expect(res.body.socketServer).to.have.property("totalConnections");
          done();
        });
    });
  });

  describe("9. Cleanup Tests", function () {
    it("should cleanup old calls", function (done) {
      request(app)
        .post("/api/call/cleanup-old-calls")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body).to.have.property("result");
          done();
        });
    });

    it("should get cleanup statistics", function (done) {
      request(app)
        .get("/api/call/cleanup-stats")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property("success", true);
          expect(res.body).to.have.property("stats");
          expect(res.body.stats).to.have.property("totalRingingCalls");
          done();
        });
    });
  });
});
