const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const wrtc = require("wrtc");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let audioStream = null;

// WebSocket for broadcaster control
wss.on("connection", ws => {
  ws.on("message", async msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if(data.type === "offer") {
      const pc = new wrtc.RTCPeerConnection();

      pc.ontrack = event => {
        audioStream = event.streams[0];
        console.log("🎵 Received audio track from broadcaster");
      };

      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(JSON.stringify({ type:"answer", sdp: pc.localDescription.sdp }));
    }
  });
});

// FM listeners endpoint
app.get("/fm.mp3", (req, res) => {
  if(!audioStream) return res.status(404).send("No audio yet");

  const track = audioStream.getAudioTracks()[0];
  if(!track) return res.status(404).send("No audio track");

  res.setHeader("Content-Type", "audio/mpeg");

  // ⚠️ wrtc track cannot be piped directly; we simulate live streaming via ffmpeg
  // In real implementation, you capture PCM from track → ffmpeg → MP3
  // For demo, fallback to a local MP3 placeholder
  ffmpeg("songs/demo.mp3") // replace with real track capture
    .format("mp3")
    .audioBitrate(128)
    .pipe(res, { end:true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ FM server running on port ${PORT}`));
