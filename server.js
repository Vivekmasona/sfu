// server.js — BiharFM WebRTC → MP3 stream (Render-ready)
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { spawn } from "child_process";
import wrtc from "wrtc";
import fs from "fs";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let broadcaster = null;
let ffmpeg = null;

// serve static for testing
app.get("/", (_, res) => res.send("🎧 BiharFM signaling server running"));
app.get("/live.mp3", (_, res) => {
  const file = "./current.mp3";
  if (fs.existsSync(file)) {
    const stream = fs.createReadStream(file);
    stream.pipe(res);
  } else {
    res.status(404).send("No live stream yet");
  }
});

wss.on("connection", ws => {
  ws.on("message", async msg => {
    const data = JSON.parse(msg);

    // --- Offer from host ---
    if (data.offer) {
      console.log("🎤 Offer received");
      broadcaster = ws;
      const pc = new wrtc.RTCPeerConnection();

      pc.ontrack = ev => {
        console.log("🎶 Track received, starting ffmpeg...");
        const track = ev.streams[0].getAudioTracks()[0];
        const receiver = pc.createReceiver(track);
        const { readable } = receiver.createEncodedStreams();

        // 🔥 FFmpeg encode to MP3 and serve
        ffmpeg = spawn("ffmpeg", [
          "-f", "webm",
          "-i", "pipe:0",
          "-c:a", "libmp3lame",
          "-b:a", "128k",
          "-f", "mp3",
          "current.mp3"
        ]);

        readable.pipe(ffmpeg.stdin);
      };

      const desc = new wrtc.RTCSessionDescription(data.offer);
      await pc.setRemoteDescription(desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));

      pc.onicecandidate = e => {
        if (e.candidate) ws.send(JSON.stringify({ ice: e.candidate }));
      };
    }

    // --- ICE candidate ---
    if (data.ice && broadcaster) {
      // (not needed in single host)
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("✅ BiharFM Signaling live on port", PORT));
