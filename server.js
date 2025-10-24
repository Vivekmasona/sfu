const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const wrtc = require("wrtc");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let audioStream = null;

wss.on("connection", ws => {
  ws.on("message", async (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    const { type, sdp } = data;

    if (type === "offer") {
      const pc = new wrtc.RTCPeerConnection();
      pc.ontrack = (event) => {
        audioStream = event.streams[0];
        console.log("Received audio track from broadcaster");
      };

      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(JSON.stringify({ type: "answer", sdp: pc.localDescription.sdp }));
    }
  });
});

app.get("/fm.mp3", (req, res) => {
  if (!audioStream) return res.status(404).send("No audio stream yet");

  const track = audioStream.getAudioTracks()[0];
  const mediaStream = new wrtc.MediaStream();
  mediaStream.addTrack(track);

  res.writeHead(200, { "Content-Type": "audio/mpeg" });
  mediaStream.pipe(res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`FM server running on port ${PORT}`));
