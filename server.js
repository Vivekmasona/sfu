// server.js — Live WebRTC → MP3 stream for browser/VLC both
// npm i express ws wrtc child_process stream

const express = require("express");
const { WebSocketServer } = require("ws");
const wrtc = require("wrtc");
const { spawn } = require("child_process");
const { PassThrough } = require("stream");
const http = require("http");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let liveStream = null;

app.get("/live.mp3", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Transfer-Encoding": "chunked",
  });

  if (liveStream) {
    console.log("🎧 New listener connected");
    liveStream.pipe(res);
    req.on("close", () => liveStream.unpipe(res));
  } else {
    res.end("No live stream yet");
  }
});

wss.on("connection", (ws) => {
  console.log("🔗 Broadcaster connected");

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);

    if (data.offer) {
      const pc = new wrtc.RTCPeerConnection();

      pc.ontrack = (event) => {
        console.log("🎙 Receiving audio stream...");
        const [stream] = event.streams;

        // Create passthrough for broadcast
        liveStream = new PassThrough();

        const ffmpeg = spawn("ffmpeg", [
          "-y",
          "-f", "webm",
          "-i", "pipe:0",
          "-vn",
          "-acodec", "libmp3lame",
          "-b:a", "64k",
          "-f", "mp3",
          "pipe:1",
        ]);

        ffmpeg.stdout.pipe(liveStream);
        ffmpeg.stderr.on("data", (d) => console.log(d.toString()));

        // Convert remote WebRTC audio to ffmpeg input
        const recorder = new wrtc.nonstandard.MediaRecorder(stream, {
          mimeType: "audio/webm",
        });
        recorder.ondataavailable = (e) => ffmpeg.stdin.write(e.data);
        recorder.start(1000);
      };

      await pc.setRemoteDescription(new wrtc.RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer: pc.localDescription }));
    }

    if (data.ice) {
      console.log("🧊 ICE received");
    }
  });
});

server.listen(10000, () => console.log("🚀 BiharFM live server running on 10000"));
