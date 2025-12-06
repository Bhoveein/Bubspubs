import React, { useEffect, useRef, useState } from 'react';
import { createSocket, createPeerConnection, PeerConnections } from './webrtc';
import type { Socket } from 'socket.io-client';

// TODO: change to your deployed backend URL later
const BACKEND_URL = 'http://192.168.1.158:4000';

const App: React.FC = () => {
  const [roomId, setRoomId] = useState('');
  const [connectedRoom, setConnectedRoom] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const peersRef = useRef<PeerConnections>({});

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideosRef = useRef<{ [id: string]: HTMLVideoElement | null }>({});

  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);

  // Init socket once
  useEffect(() => {
    const s = createSocket(BACKEND_URL);
    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // Set up socket listeners
  useEffect(() => {
    if (!socket) return;

    // Another user joined → we create an offer
    socket.on('user-joined', async ({ socketId }) => {
      if (!localStream) return;
      const pc = createPeerConnection(socketId, socket, localStream, peersRef.current);

      pc.ontrack = (event) => {
        attachRemoteStream(socketId, event.streams[0]);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('webrtc-offer', { to: socketId, offer });
    });

    socket.on('webrtc-offer', async ({ from, offer }) => {
      if (!localStream) return;
      const pc = createPeerConnection(from, socket, localStream, peersRef.current);

      pc.ontrack = (event) => {
        attachRemoteStream(from, event.streams[0]);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc-answer', { to: from, answer });
    });

    socket.on('webrtc-answer', async ({ from, answer }) => {
      const pc = peersRef.current[from];
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      const pc = peersRef.current[from];
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate', err);
      }
    });

    socket.on('user-left', ({ socketId }) => {
      const pc = peersRef.current[socketId];
      if (pc) {
        pc.close();
        delete peersRef.current[socketId];
      }
      const videoEl = remoteVideosRef.current[socketId];
      if (videoEl) {
        videoEl.srcObject = null;
      }
    });

    // Sync video controls
    socket.on('video-control', ({ type, time }) => {
      const videoEl = videoPlayerRef.current;
      if (!videoEl) return;

      if (typeof time === 'number') {
        videoEl.currentTime = time;
      }

      if (type === 'PLAY') {
        videoEl.play();
      } else if (type === 'PAUSE') {
        videoEl.pause();
      }
    });

    socket.on('video-state', ({ type, time }) => {
      const videoEl = videoPlayerRef.current;
      if (!videoEl) return;
      if (typeof time === 'number') {
        videoEl.currentTime = time;
      }
      if (type === 'PLAY') {
        videoEl.play();
      } else if (type === 'PAUSE') {
        videoEl.pause();
      }
    });

    return () => {
      socket.off('user-joined');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('user-left');
      socket.off('video-control');
      socket.off('video-state');
    };
  }, [socket, localStream]);

  function attachRemoteStream(socketId: string, stream: MediaStream) {
    let videoEl = remoteVideosRef.current[socketId];
    if (!videoEl) return;
    videoEl.srcObject = stream;
  }

  const handleJoinRoom = async () => {
    if (!socket || !roomId) return;

    // Get camera & mic
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    setLocalStream(stream);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.muted = true; // don't echo yourself
      await localVideoRef.current.play().catch(() => {});
    }

    socket.emit('join-room', { roomId });
    setConnectedRoom(roomId);
  };

  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !videoPlayerRef.current) return;
    const url = URL.createObjectURL(file);
    videoPlayerRef.current.src = url;
  };

  const sendVideoControl = (type: 'PLAY' | 'PAUSE') => {
    if (!socket || !connectedRoom || !videoPlayerRef.current) return;
    const time = videoPlayerRef.current.currentTime;
    socket.emit('video-control', {
      roomId: connectedRoom,
      type,
      time
    });
  };

  const onPlayClick = () => {
    const videoEl = videoPlayerRef.current;
    if (!videoEl) return;
    videoEl.play();
    sendVideoControl('PLAY');
  };

  const onPauseClick = () => {
    const videoEl = videoPlayerRef.current;
    if (!videoEl) return;
    videoEl.pause();
    sendVideoControl('PAUSE');
  };

  return (
    <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
      <h1>🎬 Watch Together + Video Call</h1>

      {!connectedRoom && (
        <div style={{ marginBottom: '1rem' }}>
          <input
            placeholder="Room ID (e.g. my-room)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            style={{ padding: '0.5rem', marginRight: '0.5rem' }}
          />
          <button onClick={handleJoinRoom} style={{ padding: '0.5rem 1rem' }}>
            Join room
          </button>
        </div>
      )}

      {connectedRoom && <p>Joined room: <b>{connectedRoom}</b></p>}

      {/* Video player */}
      <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <h2>Movie</h2>
        <input type="file" accept="video/*" onChange={handleVideoFileChange} />
        <div>
          <video
            ref={videoPlayerRef}
            controls
            style={{ width: '100%', maxWidth: '640px', display: 'block', marginTop: '0.5rem' }}
          />
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={onPlayClick} style={{ marginRight: '0.5rem' }}>
            ▶ Play (sync)
          </button>
          <button onClick={onPauseClick}>⏸ Pause (sync)</button>
        </div>
      </div>

      {/* Video call */}
      <div>
        <h2>Video Call</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p>You</p>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              style={{ width: '200px', height: '150px', background: '#000' }}
            />
          </div>

          {/* Placeholder for up to 3 remote users for demo */}
          {['remote1', 'remote2', 'remote3'].map((id) => (
            <div key={id}>
              <p>Remote ({id})</p>
              <video
                ref={(el) => (remoteVideosRef.current[id] = el)}
                autoPlay
                playsInline
                style={{ width: '200px', height: '150px', background: '#000' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
