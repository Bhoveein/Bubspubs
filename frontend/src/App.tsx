import React, { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket, createPeerConnection, PeerConnections } from "./webrtc";

// 👇 change this to your Render URL when deployed
// e.g. "https://bubspubs-backend.onrender.com"
const BACKEND_URL = "http://localhost:4000";

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
  const movieVideoRef = useRef<HTMLVideoElement | null>(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // create socket once
  useEffect(() => {
    const s = createSocket(BACKEND_URL);
    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // socket listeners
  useEffect(() => {
    if (!socket) return;

    // existing user hears about new user
    socket.on("user-joined", async ({ socketId }) => {
      if (!localStream) return;
      const pc = createPeerConnection(
        socketId,
        socket,
        localStream,
        peersRef.current
      );

      pc.ontrack = (event) => {
        attachRemoteStream(socketId, event.streams[0]);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("webrtc-offer", { to: socketId, offer });
    });

    // new user receives offer
    socket.on("webrtc-offer", async ({ from, offer }) => {
      if (!localStream) return;

      const pc = createPeerConnection(
        from,
        socket,
        localStream,
        peersRef.current
      );

      pc.ontrack = (event) => {
        attachRemoteStream(from, event.streams[0]);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("webrtc-answer", { to: from, answer });
    });

    socket.on("webrtc-answer", async ({ from, answer }) => {
      const pc = peersRef.current[from];
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on("webrtc-ice-candidate", async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("Error adding ICE candidate", err);
      }
    });

    socket.on("user-left", ({ socketId }) => {
      const pc = peersRef.current[socketId];
      if (pc) {
        pc.close();
        delete peersRef.current[socketId];
      }
      setRemoteVideos((prev) =>
        prev.filter((v) => v.socketId !== socketId)
      );
    });

    // movie sync
    socket.on("video-control", ({ type, time }) => {
      const movie = movieVideoRef.current;
      if (!movie) return;

      if (typeof time === "number") movie.currentTime = time;
      if (type === "PLAY") movie.play();
      if (type === "PAUSE") movie.pause();
    });

    socket.on("video-state", ({ type, time }) => {
      const movie = movieVideoRef.current;
      if (!movie) return;

      if (typeof time === "number") movie.currentTime = time;
      if (type === "PLAY") movie.play();
      if (type === "PAUSE") movie.pause();
    });

    return () => {
      socket.off("user-joined");
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate");
      socket.off("user-left");
      socket.off("video-control");
      socket.off("video-state");
    };
  }, [socket, localStream]);

  function attachRemoteStream(socketId: string, stream: MediaStream) {
    setRemoteVideos((prev) => {
      const existing = prev.find((v) => v.socketId === socketId);
      if (existing) {
        return prev.map((v) =>
          v.socketId === socketId ? { ...v, stream } : v
        );
      }
      return [...prev, { socketId, stream }];
    });
  }

  const handleJoin = async () => {
    if (!socket || !roomId.trim()) return;

    // camera / mic
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    setLocalStream(stream);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true;
      await localVideoRef.current.play().catch(() => {});
    }

    socket.emit("join-room", { roomId: roomId.trim() });
    setJoinedRoom(true);
  };

  const handleMovieFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !movieVideoRef.current) return;

    const url = URL.createObjectURL(file);
    movieVideoRef.current.src = url;
  };

  const sendVideoControl = (type: "PLAY" | "PAUSE") => {
    if (!socket || !joinedRoom || !movieVideoRef.current) return;
    socket.emit("video-control", {
      roomId,
      type,
      time: movieVideoRef.current.currentTime
    });
  };

  const onPlayClick = () => {
    const movie = movieVideoRef.current;
    if (!movie) return;
    movie.play();
    sendVideoControl("PLAY");
  };

  const onPauseClick = () => {
    const movie = movieVideoRef.current;
    if (!movie) return;
    movie.pause();
    sendVideoControl("PAUSE");
  };

  const toggleMic = () => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicOn((v) => !v);
  };

  const toggleCam = () => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamOn((v) => !v);
  };

  const hangUp = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};
    setRemoteVideos([]);
    setJoinedRoom(false);
  };

  return (
    <div className="app-root">
      {/* main movie area */}
      <video
        ref={movieVideoRef}
        className="movie"
        playsInline
      />

      {/* overlay gradient */}
      <div className="top-bar">
        <div className="brand">BubsPubs</div>
        <div className="room-controls">
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room name"
          />
          <button onClick={handleJoin} disabled={joinedRoom}>
            {joinedRoom ? "Joined" : "Join"}
          </button>
        </div>
      </div>

      {/* file picker */}
      <div className="file-picker">
        <label className="file-label">
          Choose movie
          <input type="file" accept="video/*" onChange={handleMovieFile} />
        </label>
      </div>

      {/* top self bubble */}
      {localStream && (
        <div className="bubble top-left">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
          />
          <div className="bubble-name">You</div>
          {!camOn && <div className="camera-off">Camera off</div>}
        </div>
      )}

      {/* bottom remote bubbles */}
      <div className="bottom-bubbles">
        {remoteVideos.map((rv, index) => (
          <div key={rv.socketId} className="bubble">
            <video
              autoPlay
              playsInline
              ref={(el) => {
                if (el && rv.stream && el.srcObject !== rv.stream) {
                  el.srcObject = rv.stream;
                }
              }}
            />
            <div className="bubble-name">
              Friend {index + 1}
            </div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div className="controls">
        <button onClick={toggleMic}>{micOn ? "🔊" : "🔇"}</button>
        <button onClick={toggleCam}>{camOn ? "📷" : "🚫"}</button>
        <button onClick={onPlayClick}>▶</button>
        <button onClick={onPauseClick}>⏸</button>
        <button className="end" onClick={hangUp}>
          ✕
        </button>
      </div>
    </div>
  );
};

export default App;
