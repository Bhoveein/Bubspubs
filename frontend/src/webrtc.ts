// src/webrtc.ts
import { io, Socket } from 'socket.io-client';

export type PeerConnections = {
  [socketId: string]: RTCPeerConnection;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' }, // free Google STUN
];

// Create the Socket.IO client
export function createSocket(backendUrl: string): Socket {
  return io(backendUrl, {
    transports: ['websocket'], // helps avoid some polling issues
  });
}

// Create a WebRTC peer connection to a remote socket
export function createPeerConnection(
  remoteSocketId: string,
  socket: Socket,
  localStream: MediaStream,
  peers: PeerConnections
): RTCPeerConnection {
  const pc = new RTCP
