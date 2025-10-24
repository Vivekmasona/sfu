// server.js — Bihar FM WebRTC SFU + Signaling
const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const mediasoup = require("mediasoup");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get("/", (req, res) => res.send("🎧 Bihar FM SFU Server Live!"));

// ---- Mediasoup worker/router ----
let worker, router, producerTransport, producer;
const consumers = new Map(); // listenerId -> { ws, transport, consumer }

(async () => {
  worker = await mediasoup.createWorker({
    logLevel: "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });

  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
    ],
  });

  console.log("✅ Mediasoup worker and router ready");
})();

// ---- Helper ----
function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

// ---- WebSocket Handling ----
wss.on("connection", ws => {
  const id = crypto.randomUUID();
  console.log("🔗 Connected:", id);

  ws.on("message", async raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { type, payload, role } = msg;

    // -------- Broadcaster Register --------
    if (type === "broadcaster-register") {
      producerTransport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: null }],
        enableUdp: false, // Render does not allow UDP
        enableTcp: true,
      });

      safeSend(ws, { type: "create-transport", payload: producerTransport.params });
    }

    // -------- Broadcaster Produce Audio --------
    if (type === "produce") {
      producer = await producerTransport.produce({
        kind: "audio",
        rtpParameters: payload.rtpParameters,
      });
      safeSend(ws, { type: "produced" });
      console.log("🎤 Broadcaster audio produced:", producer.id);
    }

    // -------- Listener Register --------
    if (type === "listener-register") {
      const consumerTransport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: null }],
        enableUdp: false,
        enableTcp: true,
      });

      consumers.set(id, { ws, transport: consumerTransport, consumer: null });
      safeSend(ws, { type: "create-transport", payload: consumerTransport.params });
      console.log("👂 Listener ready:", id);
    }

    // -------- Listener Consume --------
    if (type === "consume") {
      const c = consumers.get(id);
      if (!producer) return; // No producer yet

      const consumer = await c.transport.consume({
        producerId: producer.id,
        rtpCapabilities: payload.rtpCapabilities,
        paused: false,
      });

      c.consumer = consumer;
      safeSend(ws, {
        type: "consumed",
        payload: {
          id: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        },
      });

      console.log("🎧 Listener consuming:", id);
    }
  });

  ws.on("close", () => {
    if (consumers.has(id)) consumers.delete(id);
    console.log("❌ Disconnected:", id);
  });

  ws.on("error", err => console.error("WebSocket error:", err.message));
});

// ---- Keep-alive ping ----
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) safeSend(ws, { type: "ping" });
  });
}, 25000);

// ---- Server listen ----
server.keepAliveTimeout = 70000;
server.headersTimeout = 75000;
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Bihar FM SFU Server running on port ${PORT}`));
