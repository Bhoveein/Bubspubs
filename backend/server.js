import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("Bubspubs signaling server is running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In-memory video state per room
const rooms = {};

io.on("connection", (socket) => {
  console.log("New client:", socket.id);

  socket.on("join-room", ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`Socket ${socket.id} joined room ${roomId}`);

    // Notify existing peers so they create an offer
    socket.to(roomId).emit("user-joined", { socketId: socket.id });

    // Send current video state (if any) to new user
    const state = rooms[roomId]?.videoState;
    if (state) {
      socket.emit("video-state", state);
    }
  });

  // WebRTC signaling
  socket.on("webrtc-offer", ({ to, offer }) => {
    io.to(to).emit("webrtc-offer", { from: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    io.to(to).emit("webrtc-answer", { from: socket.id, answer });
  });

  socket.on("webrtc-ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("webrtc-ice-candidate", { from: socket.id, candidate });
  });

  // Video sync (play / pause / seek)
  socket.on("video-control", ({ roomId, type, time }) => {
    if (!roomId) return;

    rooms[roomId] = rooms[roomId] || {};
    rooms[roomId].videoState = {
      type,
      time,
      updatedAt: Date.now()
    };

    socket.to(roomId).emit("video-control", { type, time });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit("user-left", { socketId: socket.id });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
