// src/webrtc.ts
import { io, Socket } from 'socket.io-client';

export type PeerConnections = {
  [socketId: string]: RTCPeerConnection;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' }, // Free Google STUN
];

// Create a Socket.IO client connection
export function createSocket(backendUrl: string): Socket {
  return io(backendUrl, {
    transports: ['websocket'],
  });
}

// Create and return a new RTCPeerConnection
export function createPeerConnection(
  remoteSocketId: string,
  socket: Socket,
  localStream: MediaStream,
  peers: PeerConnections
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Send ICE candidates to the remote peer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice-candidate', {
        to: remoteSocketId,
        candidate: event.candidate,
      });
    }
  };

  // Add all local media tracks to the peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Store the connection
  peers[remoteSocketId] = pc;

  return pc;
}
