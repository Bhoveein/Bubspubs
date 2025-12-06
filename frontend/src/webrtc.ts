import { io, Socket } from "socket.io-client";

export type PeerConnections = {
  [socketId: string]: RTCPeerConnection;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" } // free Google STUN server
];

export function createSocket(backendUrl: string): Socket {
  return io(backendUrl, {
    transports: ["websocket"], // helps avoid some polling issues
  });
}

export function createPeerConnection(
  remoteSocketId: string,
  socket: Socket,
  localStream: MediaStream,
  peers: PeerConnections
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Send ICE candidates to remote peer through signaling server
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", {
        to: remoteSocketId,
        candidate: event.candidate,
      });
    }
  };

  // Add local media (camera + mic) tracks
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Store this connection by the remote socket ID
  peers[remoteSocketId] = pc;

  return pc;
}
