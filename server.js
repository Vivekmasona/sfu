// server.js
import express from "express";
import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import fs from "fs";
import http from "http";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let currentStream = null;

// Serve current audio as live.mp3
app.get("/live.mp3", (req, res) => {
  res.writeHead(200, { "Content-Type": "audio/mpeg" });
  if (currentStream) currentStream.pipe(res);
  else res.end();
});

wss.on("connection", ws => {
  let ffmpeg;
  ws.on("message", async msg => {
    const data = JSON.parse(msg);
    if (data.offer) {
      const { RTCPeerConnection } = await import("wrtc");
      const pc = new RTCPeerConnection();

      const audioFile = fs.createWriteStream("/tmp/live.mp3");
      ffmpeg = spawn("ffmpeg", [
        "-y",
        "-f", "s16le",
        "-ar", "48000",
        "-ac", "2",
        "-i", "pipe:0",
        "-b:a", "32k",
        "-content_type", "audio/mpeg",
        "-f", "mp3", "-",
      ]);

      ffmpeg.stdout.on("data", d => {
        if (!currentStream) {
          currentStream = new PassThrough();
        }
        currentStream.write(d);
      });

      const track = pc.addTransceiver("audio").receiver;
      const stream = track.track;
      const sink = new (await import("stream")).Writable({
        write(chunk, _, cb) { ffmpeg.stdin.write(chunk); cb(); }
      });
      stream.pipe(sink);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));
    }
  });

  ws.on("close", () => {
    if (ffmpeg) ffmpeg.kill("SIGINT");
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Live audio server running");
});
