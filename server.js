// server.js — BiharFM WebRTC to Icecast bridge
// npm i express ws wrtc child_process

const express = require("express");
const { WebSocketServer } = require("ws");
const wrtc = require("wrtc");
const { spawn } = require("child_process");
const http = require("http");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(".")); // to serve host.html etc.

wss.on("connection", (ws) => {
  console.log("🔗 New WebSocket client connected");

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);

    if (data.offer) {
      console.log("📡 Got offer from broadcaster");

      const pc = new wrtc.RTCPeerConnection();
      pc.onicecandidate = (e) => {
        if (e.candidate) ws.send(JSON.stringify({ ice: e.candidate }));
      };

      // When stream arrives
      pc.ontrack = (event) => {
        console.log("🎧 Receiving audio track...");
        const [stream] = event.streams;

        // Convert stream → FFmpeg → Icecast
        const ffmpeg = spawn("ffmpeg", [
          "-y",
          "-f", "webm",
          "-i", "pipe:0",
          "-acodec", "libmp3lame",
          "-b:a", "64k",
          "-content_type", "audio/mpeg",
          "-f", "mp3",
          "icecast://source:hackme@localhost:8000/live"
        ]);

        ffmpeg.stderr.on("data", (d) => console.log(d.toString()));
        ffmpeg.on("exit", () => console.log("❌ FFmpeg closed"));

        // Convert remote track → readable audio chunks
        const recorder = new wrtc.nonstandard.MediaRecorder(stream, {
          mimeType: "audio/webm"
        });
        recorder.ondataavailable = (e) => ffmpeg.stdin.write(e.data);
        recorder.start(1000);
      };

      await pc.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));
      console.log("✅ Answer sent to client");
    }

    if (data.ice) {
      console.log("🧊 ICE received");
    }
  });
});

server.listen(10000, () => console.log("🚀 Server running on :10000"));
