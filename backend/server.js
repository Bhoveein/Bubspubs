import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("Server running ✅");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
    io.to(roomId).emit("user-joined", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
