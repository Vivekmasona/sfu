const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const upload = multer({ dest: "songs/" });
let currentFile = null;

// Serve broadcaster file upload
app.post("/upload", upload.single("audio"), (req, res) => {
  if(!req.file) return res.status(400).send("No file uploaded");
  currentFile = req.file.path;
  console.log("🎵 Broadcaster uploaded:", req.file.originalname);
  res.json({ filename: req.file.filename });
});

// FM listeners endpoint
app.get("/fm.mp3", (req, res) => {
  if(!currentFile) return res.status(404).send("No song yet");

  res.setHeader("Content-Type", "audio/mpeg");

  ffmpeg(currentFile)
    .format("mp3")
    .audioBitrate(128)
    .on("error", err => console.error("FFmpeg error:", err.message))
    .pipe(res, { end: true });
});

// Optional WebSocket control (play/pause/notify)
wss.on("connection", ws => {
  ws.on("message", msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if(data.type === "play" && data.filename) {
      const filePath = path.join(__dirname, "songs", data.filename);
      if(fs.existsSync(filePath)) {
        currentFile = filePath;
        console.log("▶️ Playing:", data.filename);
        // Notify all listeners (optional)
        wss.clients.forEach(client => {
          if(client.readyState === WebSocket.OPEN)
            client.send(JSON.stringify({ type:"play", filename:data.filename }));
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ FM server running on port ${PORT}`));
