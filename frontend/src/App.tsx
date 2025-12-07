import React, { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { createSocket, createPeerConnection, PeerConnections } from "./webrtc";

// 🔴 IMPORTANT: your Render backend URL
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
  const movieVideoRef = useRef<HTMLVideoElement | null>(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // 👇 EVERY time we get a localStream, attach it to the <video>
  useEffect(() => {
    if (!localStream || !localVideoRef.current) return;

    const videoEl = localVideoRef.current;
    videoEl.srcObject = localStream;
    videoEl.muted = true;

    (async () => {
      try {
        await videoEl.play();
        console.log("Local video is playing");
      } catch (err) {
        console.warn("Video play() was blocked:", err);
      }
    })();
  }, [localStream]);

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

    socket.on("user-joined", async ({ socketId }) => {
      if (!localStream) return;
      setStatusMsg("New user joined, creating WebRTC offer…");

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

    socket.on("webrtc-offer", async ({ from, offer }) => {
      if (!localStream) return;
      setStatusMsg("Received offer, sending answer…");

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
      setStatusMsg("Connected to remote peer ✅");
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
      setRemoteVideos((prev) => prev.filter((v) => v.socketId !== socketId));
      setStatusMsg("A user left the room.");
    });

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

  const createRoom = () => {
    const id = Math.random().toString(36).substring(2, 8);
    setRoomId(id);
    setStatusMsg(`Room created: ${id}. Share this code.`);
  };

  const handleJoin = async () => {
    if (!socket || !roomId.trim()) {
      setStatusMsg("Enter a room ID or create one first.");
      return;
    }

    try {
      setStatusMsg("Requesting camera & microphone…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("Got local stream:", stream);
      setLocalStream(stream); // effect above will attach it to <video>

      socket.emit("join-room", { roomId: roomId.trim() });
      setJoinedRoom(true);
      setStatusMsg(`Joined room "${roomId.trim()}". Waiting for others…`);
    } catch (err) {
      console.error("getUserMedia error", err);
      setStatusMsg("Could not access camera/mic. Check permissions.");
    }
  };

  const handleMovieFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !movieVideoRef.current) return;

    const url = URL.createObjectURL(file);
    movieVideoRef.current.src = url;
    setStatusMsg("Movie loaded. Press Play to sync.");
  };

  const sendVideoControl = (type: "PLAY" | "PAUSE") => {
    if (!socket || !joinedRoom || !movieVideoRef.current) return;
    socket.emit("video-control", {
      roomId,
      type,
      time: movieVideoRef.current.currentTime,
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
    setMicOn((prev) => {
      const newVal = !prev;
      localStream.getAudioTracks().forEach((t) => (t.enabled = newVal));
      return newVal;
    });
  };

  const toggleCam = () => {
    if (!localStream) return;
    setCamOn((prev) => {
      const newVal = !prev;
      localStream.getVideoTracks().forEach((t) => (t.enabled = newVal));
      return newVal;
    });
  };

  const hangUp = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};
    setRemoteVideos([]);
    setJoinedRoom(false);
    setLocalStream(null);
    setStatusMsg("You left the call.");
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">BubsPubs</div>
        <div className="room-box">
          <button onClick={createRoom} className="secondary">
            Create Room
          </button>
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Room ID"
          />
          <button onClick={handleJoin} disabled={joinedRoom}>
            {joinedRoom ? "Joined" : "Join"}
          </button>
        </div>
      </header>

      {statusMsg && <div className="status-bar">{statusMsg}</div>}

      <main className="main-layout">
        {/* Movie area */}
        <section className="movie-section">
          <h2>Shared Movie</h2>
          <label className="file-label">
            Choose video file
            <input type="file" accept="video/*" onChange={handleMovieFile} />
          </label>

          <div className="movie-wrapper">
            <video
              ref={movieVideoRef}
              className="movie-video"
              playsInline
            />
          </div>

          <div className="movie-controls">
            <button onClick={onPlayClick}>▶ Play (sync)</button>
            <button onClick={onPauseClick}>⏸ Pause (sync)</button>
          </div>
        </section>

        {/* Call area */}
        <section className="call-section">
          <h2>Video Call</h2>
          <div className="call-grid">
            <div className="call-tile you">
              {localStream ? (
                <>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    className="call-video"
                  />
                  <span className="call-name">You</span>
                  {!camOn && (
                    <div className="overlay-text">Camera off</div>
                  )}
                </>
              ) : (
                <div className="placeholder">
                  {joinedRoom
                    ? "Waiting for camera permission…"
                    : "Join a room to start your camera."}
                </div>
              )}
            </div>

            {remoteVideos.map((rv) => (
              <div key={rv.socketId} className="call-tile">
                {rv.stream ? (
                  <>
                    <video
                      autoPlay
                      playsInline
                      className="call-video"
                      ref={(el) => {
                        if (el && rv.stream && el.srcObject !== rv.stream) {
                          el.srcObject = rv.stream;
                        }
                      }}
                    />
                    <span className="call-name">
                      {rv.socketId.slice(0, 6)}
                    </span>
                  </>
                ) : (
                  <div className="placeholder">Connecting…</div>
                )}
              </div>
            ))}
          </div>

          <div className="call-controls">
            <button onClick={toggleMic}>{micOn ? "Mute" : "Unmute"}</button>
            <button onClick={toggleCam}>
              {camOn ? "Camera Off" : "Camera On"}
            </button>
            <button className="end" onClick={hangUp}>
              Hang Up
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;

