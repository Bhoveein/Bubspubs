import React, { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket, createPeerConnection, PeerConnections } from "./webrtc";

const BACKEND_URL = "https://bubspubs-backend.onrender.com";

type RemoteVideo = {
  socketId: string;
  stream: MediaStream | null;
};

const App: React.FC = () => {
  const [roomId, setRoomId] = useState("");
  const [joinedRoom, setJoinedRoom] = useState(false);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([]);

  const peersRef = useRef<PeerConnections>({});
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // ✅ START CAMERA
  useEffect(() => {
    if (!joinedRoom) return;

    const startCamera = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setLocalStream(stream);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play();
      }
    };

    startCamera();
  }, [joinedRoom]);

  // ✅ CREATE SOCKET
  useEffect(() => {
    if (!joinedRoom) return;

    const s = createSocket(BACKEND_URL);
    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [joinedRoom]);

  // ✅ SOCKET EVENTS
  useEffect(() => {
    if (!socket || !localStream) return;

    socket.on("user-joined", async ({ socketId }) => {
      const pc = createPeerConnection(
        socketId,
        socket,
        localStream,
        peersRef.current
      );

      pc.ontrack = (event) => {
        setRemoteVideos((prev) => [
          ...prev,
          { socketId, stream: event.streams[0] },
        ]);
      };
    });
  }, [socket, localStream]);

  const createRoom = () => {
    const id = Math.random().toString(36).substring(2, 8);
    setRoomId(id);
    setJoinedRoom(true);
  };

  const joinRoom = () => {
    if (!roomId) return alert("Enter room id");
    setJoinedRoom(true);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>BubsPubs</h1>

      {!joinedRoom && (
        <>
          <button onClick={createRoom}>Create Room</button>
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room ID"
          />
          <button onClick={joinRoom}>Join</button>
        </>
      )}

      {joinedRoom && (
        <>
          <h2>Video Call</h2>

          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: 320,
              height: 240,
              background: "black",
              borderRadius: 12,
            }}
          />

          {remoteVideos.map((v) => (
            <video
              key={v.socketId}
              autoPlay
              playsInline
              ref={(el) => {
                if (el && v.stream) el.srcObject = v.stream;
              }}
              style={{
                width: 320,
                height: 240,
                background: "black",
                borderRadius: 12,
              }}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default App;

