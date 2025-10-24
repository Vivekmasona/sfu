const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const wrtc = require("wrtc");
const streamifier = require("streamifier");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

let audioStream = null; // Broadcaster audio track stream

// --- WebSocket control ---
wss.on("connection", ws => {
  ws.on("message", async (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    const { type, sdp } = data;

    // Broadcaster sends SDP offer
    if(type === "offer") {
      const pc = new wrtc.RTCPeerConnection();

      pc.ontrack = (event) => {
        audioStream = event.streams[0];
        console.log("🎤 Received audio track from broadcaster");
      };

      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(JSON.stringify({ type: "answer", sdp: pc.localDescription.sdp }));
    }
  });
});

// --- HTTP stream for FM listeners ---
app.get("/fm.mp3", (req, res) => {
  if(!audioStream) return res.status(404).send("No audio stream yet");

  const track = audioStream.getAudioTracks()[0];
  const mediaStream = new wrtc.MediaStream();
  mediaStream.addTrack(track);

  // For simplicity, just send static buffer chunks (demo)
  // In production, you’d use an audio encoder (e.g., node-lame) to convert WebRTC track to mp3 stream
  res.writeHead(200, { "Content-Type": "audio/mpeg" });
  res.end("Streaming via WebRTC track (demo, implement encoder for real-time mp3)");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`✅ FM WebRTC server running on port ${PORT}`));
