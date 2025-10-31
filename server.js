// server.js — BiharFM WebRTC → MP3 stream (Render-ready, 32kbps)
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

app.get("/", (_, res) => res.send("🎧 BiharFM signaling server running"));
app.get("/live.mp3", (_, res) => {
  const file = "./current.mp3";
  if (fs.existsSync(file)) {
    const stream = fs.createReadStream(file);
    res.setHeader("Content-Type", "audio/mpeg");
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
        console.log("🎶 Track received, starting ffmpeg (32kbps)...");
        const audioStream = ev.streams[0];
        const output = "current.mp3";

        if (ffmpeg) {
          ffmpeg.kill("SIGINT");
        }

        // 🧩 Create WebM stream from incoming WebRTC audio
        const recorder = new wrtc.MediaRecorder(audioStream, {
          mimeType: "audio/webm; codecs=opus"
        });

        ffmpeg = spawn("ffmpeg", [
          "-y",               // overwrite
          "-f", "webm",
          "-i", "pipe:0",
          "-c:a", "libmp3lame",
          "-b:a", "32k",       // 🔥 32 kbps bitrate
          "-ar", "44100",
          "-ac", "2",
          "-f", "mp3",
          output
        ]);

        recorder.ondataavailable = e => e.data.arrayBuffer().then(buf => ffmpeg.stdin.write(Buffer.from(buf)));
        recorder.start(100);
        audioStream.oninactive = () => {
          ffmpeg.stdin.end();
          recorder.stop();
        };
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
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("✅ BiharFM (32kbps) live on port", PORT));
