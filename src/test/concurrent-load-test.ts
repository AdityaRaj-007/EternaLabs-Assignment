import net from "net";
import tls from "tls";
import crypto from "crypto";
import "dotenv/config";

const PORT = 443;
const HOST = "eternalabs-assignment-1.onrender.com";
const ENDPOINT = process.env.ENDPOINT || "/api/orders/execute";
const TOTAL_ORDERS = 10;

const IS_SECURE = PORT === 443;

let NUMBER_OF_SUCCESSORDERS = 0;
let NUMBER_OF_FAILEDORDERS = 0;

console.log(
  `Target: ${IS_SECURE ? "https://" : "http://"}${HOST}:${PORT}${ENDPOINT}`
);

const generateWebsocketKey = () => {
  return crypto.randomBytes(16).toString("base64");
};

const runClient = (clientId: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    let socket: net.Socket | tls.TLSSocket;

    const onConnect = () => {
      console.log(
        `[Client ${clientId}] Connected to server via ${
          IS_SECURE ? "TLS" : "TCP"
        }`
      );

      const body = JSON.stringify({
        inputToken: "SOL",
        outputToken: "USDC",
        amount: 3,
      });

      const bodyLength = Buffer.byteLength(body);

      const httpReq =
        `POST ${ENDPOINT} HTTP/1.1\r\n` +
        `Host: ${HOST}\r\n` +
        `Content-Type: application/json\r\n` +
        `Content-Length: ${bodyLength}\r\n` +
        `Connection: keep-alive\r\n` +
        `\r\n` +
        body;

      socket.write(httpReq);
    };

    if (IS_SECURE) {
      socket = tls.connect(
        PORT,
        HOST,
        {
          servername: HOST,
          ALPNProtocols: ["http/1.1"],
          rejectUnauthorized: false,
        },
        onConnect
      );
    } else {
      socket = new net.Socket();
      socket.connect(PORT, HOST, onConnect);
    }

    let buffer = Buffer.alloc(0);
    let currStep = "Sending POST Req";
    let orderId: string = "";

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const resStr = buffer.toString("utf-8");

      if (currStep === "Sending POST Req") {
        const jsonStart = resStr.indexOf("{");
        const jsonEnd = resStr.lastIndexOf("}");

        if (jsonStart !== -1 && jsonEnd !== -1) {
          try {
            const jsonString = resStr.substring(jsonStart, jsonEnd + 1);
            const data = JSON.parse(jsonString);

            if (data.orderId) {
              orderId = data.orderId;
              console.log(`[Client ${clientId}] ✅ Order Created: ${orderId}`);

              buffer = buffer.subarray(
                Buffer.byteLength(resStr.substring(0, jsonEnd + 1))
              );

              currStep = "Upgrade Connection";
              sendUpgradeRequest();
            }
          } catch (err) {
            // Partial JSON, wait for more data
          }
        }
      } else if (currStep === "Upgrade Connection") {
        const upgradeHeaderStart = buffer.indexOf("HTTP/1.1 101");

        if (upgradeHeaderStart === -1) {
          if (buffer.length < 50 && !resStr.includes("HTTP")) {
            buffer = Buffer.alloc(0);
          }
          return;
        }

        if (upgradeHeaderStart > 0) {
          buffer = buffer.subarray(upgradeHeaderStart);
        }

        const headerEndIdx = buffer.indexOf("\r\n\r\n");

        if (headerEndIdx !== -1) {
          console.log(`[Client ${clientId}] 🟢 WebSocket Upgrade Successful!`);

          buffer = buffer.subarray(headerEndIdx + 4);
          currStep = "WEBSOCKET";

          if (buffer.length > 0) processWebSocketFrame();
        }
      } else if (currStep === "WEBSOCKET") {
        processWebSocketFrame();
      }
    });

    const sendUpgradeRequest = () => {
      const websocketKey = generateWebsocketKey();
      const upgradeReq =
        `GET ${ENDPOINT}?orderId=${orderId} HTTP/1.1\r\n` +
        `Host: ${HOST}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${websocketKey}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `\r\n`;

      socket.write(upgradeReq);
    };

    const processWebSocketFrame = () => {
      while (buffer.length >= 2) {
        const firstByte = buffer[0];
        const opCode = firstByte & 0x0f;

        const secondByte = buffer[1];
        let payloadLength = secondByte & 0x7f;
        let offset = 2;

        if (payloadLength === 126) {
          if (buffer.length < 4) return;
          payloadLength = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLength === 127) {
          socket.end();
          return;
        }

        if (buffer.length < offset + payloadLength) return;

        const payload = buffer.subarray(offset, offset + payloadLength);
        buffer = buffer.subarray(offset + payloadLength);

        if (opCode === 0x01) {
          const message = payload.toString("utf8");
          try {
            const update = JSON.parse(message);
            console.log(
              `📩 UPDATE: Order id: ${
                update.id
              }, [${update.status.toUpperCase()}] at ${update.timestamp}`
            );

            if (update.status === "confirmed") {
              NUMBER_OF_SUCCESSORDERS++;
              socket.end();
              resolve();
            } else if (update.status === "failed") {
              NUMBER_OF_FAILEDORDERS++;
              socket.end();
              resolve();
            }
          } catch (err) {
            console.error(`[Client ${clientId}] JSON Error`, err);
          }
        } else if (opCode === 0x08) {
          console.log(`[Client ${clientId}] 🔴 Server sent Close Frame`);
          socket.end();
          resolve();
        }
      }
    };

    socket.on("error", (err) => {
      console.error(`[Client ${clientId}] Error:`, err.message);
      resolve();
    });

    socket.on("end", () => resolve());
  });
};

const runConcurrentLoadTest = async () => {
  console.log(`🚀 Starting Load Test with ${TOTAL_ORDERS} clients...`);
  const startTime = Date.now();
  const clients = Array.from({ length: TOTAL_ORDERS }, (_, idx) =>
    runClient(idx + 1)
  );
  await Promise.all(clients);
  const duration = (Date.now() - startTime) / 1000;

  console.log("\n========================================");
  console.log(`✅ Successful:  ${NUMBER_OF_SUCCESSORDERS}`);
  console.log(`❌ Failed:      ${NUMBER_OF_FAILEDORDERS}`);
  console.log(`⏱️ Duration:    ${duration.toFixed(2)}s`);
  console.log(
    `⚡ Throughput:  ${(NUMBER_OF_SUCCESSORDERS / duration).toFixed(2)} req/sec`
  );
  console.log("========================================");
};

runConcurrentLoadTest();
