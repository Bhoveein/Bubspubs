import { io, Socket } from "socket.io-client";

export type PeerConnections = Record<string, RTCPeerConnection>;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" }
];

export function createSocket(backendUrl: string): Socket {
  return io(backendUrl, { transports: ["websocket"] });
}

export function createPeerConnection(
  remoteSocketId: string,
  socket: Socket,
  localStream: MediaStream,
  peers: PeerConnections
): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", {
        to: remoteSocketId,
        candidate: event.candidate
      });
    }
  };

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  peers[remoteSocketId] = pc;
  return pc;
}

