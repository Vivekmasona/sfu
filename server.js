// server.js
const express = require("express");
const { WebSocketServer } = require("ws");
const wrtc = require("wrtc");
const { spawn } = require("child_process");

const app = express();
const server = require("http").createServer(app);
const wss = new WebSocketServer({ server });

let peerConnection;

wss.on("connection", ws => {
  ws.on("message", async msg => {
    const data = JSON.parse(msg);

    if (data.offer) {
      console.log("🎧 Offer received");

      peerConnection = new wrtc.RTCPeerConnection();

      peerConnection.ontrack = (e) => {
        const [stream] = e.streams;
        console.log("🎙 Receiving audio stream from host...");

        // Capture WebRTC audio into FFmpeg
        const ffmpeg = spawn("ffmpeg", [
          "-f", "webm",
          "-i", "pipe:0",
          "-acodec", "libmp3lame",
          "-b:a", "128k",
          "-content_type", "audio/mpeg",
          "-f", "mp3",
          "icecast://source:hackme@localhost:8000/live"
        ]);

        ffmpeg.stderr.on("data", d => console.log("FFmpeg:", d.toString()));

        // Use MediaRecorder to get PCM chunks
        const recorder = new wrtc.MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });

        recorder.ondataavailable = (event) => {
          event.data.arrayBuffer().then(buf => {
            ffmpeg.stdin.write(Buffer.from(buf));
          });
        };

        recorder.onstop = () => {
          ffmpeg.stdin.end();
          console.log("🔴 Stream stopped");
        };

        recorder.start(100); // every 100ms chunk
      };

      const desc = new wrtc.RTCSessionDescription(data.offer);
      await peerConnection.setRemoteDescription(desc);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer: peerConnection.localDescription }));

      peerConnection.onicecandidate = e => {
        if (e.candidate) ws.send(JSON.stringify({ ice: e.candidate }));
      };
    }

    if (data.ice) {
      await peerConnection.addIceCandidate(new wrtc.RTCIceCandidate(data.ice));
    }
  });
});

app.use(express.static("."));
server.listen(8080, () => console.log("🚀 WebRTC → Icecast bridge on :8080"));
