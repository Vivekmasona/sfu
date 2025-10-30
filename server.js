// server.js — WebRTC bridge -> /live.mp3 endpoint
// npm i express ws wrtc child_process
const express = require("express");
const { WebSocketServer } = require("ws");
const wrtc = require("wrtc");
const { spawn } = require("child_process");

const app = express();
const server = require("http").createServer(app);
const wss = new WebSocketServer({ server });

// store active connection + ffmpeg
let peerConnection = null;
let ffmpeg = null;

app.use(express.static(".")); // serve host.html

// --- serve live audio as HTTP stream ---
app.get("/live.mp3", (req, res) => {
  res.set({
    "Content-Type": "audio/mpeg",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Transfer-Encoding": "chunked"
  });

  console.log("🎧 Listener connected");
  if (ffmpeg) {
    ffmpeg.stdout.pipe(res);
    req.on("close", () => {
      try { ffmpeg.stdout.unpipe(res); } catch {}
      console.log("❌ Listener left");
    });
  } else {
    res.status(503).end("No live stream");
  }
});

wss.on("connection", ws => {
  ws.on("message", async msg => {
    const data = JSON.parse(msg);

    if (data.offer) {
      console.log("📡 Host connected, starting WebRTC...");
      peerConnection = new wrtc.RTCPeerConnection();

      // Handle remote track (audio)
      peerConnection.ontrack = (e) => {
        console.log("🎙 Receiving audio stream");
        const stream = e.streams[0];

        // Create FFmpeg process to convert to MP3 live
        ffmpeg = spawn("ffmpeg", [
          "-loglevel", "error",
          "-f", "webm",
          "-i", "pipe:0",
          "-vn",
          "-c:a", "libmp3lame",
          "-b:a", "128k",
          "-f", "mp3",
          "pipe:1"
        ]);

        // Read audio data and pipe to FFmpeg
        const recorder = new wrtc.nonstandard.RTCAudioSink(stream.getAudioTracks()[0]);
        const { RTCAudioSink } = wrtc.nonstandard;
        const sink = new RTCAudioSink(stream.getAudioTracks()[0]);

        sink.ondata = ({ samples }) => {
          // Just to keep connection alive, WebRTC lib automatically feeds pipe:0
        };

        // Connect WebRTC to FFmpeg (standard approach via MediaStreamTrackProcessor)
        const { MediaStreamTrack } = wrtc;
        const audioTrack = stream.getAudioTracks()[0];
        const reader = new wrtc.nonstandard.MediaStreamTrackProcessor(audioTrack).readable.getReader();

        async function pump() {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            ffmpeg.stdin.write(value.data);
          }
        }
        pump();
      };

      await peerConnection.setRemoteDescription(data.offer);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer: peerConnection.localDescription }));

      peerConnection.onicecandidate = e => {
        if (e.candidate) ws.send(JSON.stringify({ ice: e.candidate }));
      };
    }

    if (data.ice && peerConnection) {
      await peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(data.ice));
    }
  });

  ws.on("close", () => {
    console.log("❌ Host disconnected");
    if (ffmpeg) {
      try { ffmpeg.kill("SIGKILL"); } catch {}
      ffmpeg = null;
    }
    peerConnection = null;
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Live FM server running on ${PORT}`));
