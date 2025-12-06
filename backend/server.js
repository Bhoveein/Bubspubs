import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Signaling server is running');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// in-memory room state (simple)
const rooms = {};

io.on('connection', (socket) => {
  console.log('New client:', socket.id);

  socket.on('join-room', ({ roomId }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`Socket ${socket.id} joined room ${roomId}`);

    // Tell others in the room about the new user
    socket.to(roomId).emit('user-joined', { socketId: socket.id });

    // Send current video state (if we have it)
    const state = rooms[roomId]?.videoState;
    if (state) {
      socket.emit('video-state', state);
    }
  });

  // WebRTC signaling
  socket.on('webrtc-offer', ({ to, offer }) => {
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // Video sync
  socket.on('video-control', ({ roomId, type, time }) => {
    rooms[roomId] = rooms[roomId] || {};
    rooms[roomId].videoState = { type, time, updatedAt: Date.now() };

    // Broadcast to everyone else in the room
    socket.to(roomId).emit('video-control', { type, time });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const roomId = socket.roomId;
    if (roomId) {
      socket.to(roomId).emit('user-left', { socketId: socket.id });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});

