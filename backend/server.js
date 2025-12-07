import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

// Simple test route so we can see if the server is running
app.get("/", (req, res) => {
  res.send("BubsPubs signaling server is running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId }) => {
    console.log(`Socket ${socket.id} joining room ${roomId}`);
    socket.join(roomId);
    socket.to(roomId).emit("user-joined", { socketId: socket.id });
  });

  socket.on("webrtc-offer", (data) => {
    io.to(data.to).emit("webrtc-offer", data);
  });

  socket.on("webrtc-answer", (data) => {
    io.to(data.to).emit("webrtc-answer", data);
  });

  socket.on("webrtc-ice-candidate", (data) => {
    io.to(data.to).emit("webrtc-ice-candidate", data);
  });

  socket.on("video-control", (data) => {
    io.to(data.roomId).emit("video-control", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    io.emit("user-left", { socketId: socket.id });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

