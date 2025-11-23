import net from "net";
import crypto from "crypto";
import "dotenv/config";

const PORT = Number(process.env.PORT);
const HOST = process.env.HOST || "127.0.0.1";
const ENDPOINT = process.env.ENDPOINT;
const TOTAL_ORDERS = 10;

let NUMBER_OF_SUCCESSORDERS = 0;
let NUMBER_OF_FAILEDORDERS = 0;

console.log(`http://${HOST}:${PORT}${ENDPOINT}`);

const generateWebsocketKey = () => {
  return crypto.randomBytes(16).toString("base64");
};

const runClient = (clientId: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    socket.connect(PORT, HOST, () => {
      console.log("1. Connected to server via tcp soclet");

      const body = JSON.stringify({
        inputToken: "SOL",
        outputToken: "USDC",
        amount: 3,
      });

      const bodyLength = Buffer.byteLength(body);

      const httpReq =
        `POST ${ENDPOINT} HTTP/1.1\r\n` +
        `Host: ${HOST}:${PORT}\r\n` +
        `Content-Type: application/json\r\n` +
        `Content-Length: ${bodyLength}\r\n` +
        `Connection: keep-alive\r\n` +
        `\r\n` +
        body;

      console.log("2. Sending HTTP POST req...");
      socket.write(httpReq);
    });

    let buffer = Buffer.alloc(0);

    let currStep = "Sending POST Req";
    let orderId: string = "";

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (currStep === "Sending POST Req") {
        const headerEndIdx = buffer.indexOf("\r\n\r\n");

        if (headerEndIdx !== -1) {
          const resStr = buffer.toString("utf-8");

          console.log("\n📩 HTTP Response Received");

          try {
            //console.log(resStr);
            const resParts = resStr.split("\r\n\r\n");
            //console.log(resParts);
            const body = resParts[1];
            //console.log(body);
            const data = JSON.parse(body);
            //console.log(data);
            orderId = data.orderId;
            console.log(`Order id: ${orderId}`);

            buffer = Buffer.alloc(0);
            currStep = "Upgrade Connection";
            sendUpgradeRequest();
          } catch (err) {
            console.error("Error parsing JSON or incomplete body:", err);
          }
        }
      } else if (currStep === "Upgrade Connection") {
        const headerEndIdx = buffer.indexOf("\r\n\r\n");

        if (headerEndIdx !== -1) {
          const resStr = buffer.toString("utf-8");

          if (resStr.startsWith("HTTP/1.1 101")) {
            console.log("\n🟢 WebSocket Upgrade Successful!");

            buffer = buffer.subarray(headerEndIdx + 4);
            currStep = "WEBSOCKET";

            if (buffer.length > 0) processWebSocketFrame();
          }
        }
      } else if (currStep === "WEBSOCKET") {
        processWebSocketFrame();
      }
    });

    const sendUpgradeRequest = () => {
      console.log(
        "3. Sending WebSocket upgrade request on the same connection."
      );
      const websocketKey = generateWebsocketKey();

      const upgradeReq =
        `GET ${ENDPOINT}?orderId=${orderId} HTTP/1.1\r\n` +
        `Host: ${HOST}:${PORT}\r\n` +
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
          console.log(
            "Message too large (64-bit length not supported in this simple parser)"
          );
          return;
        }

        if (buffer.length < offset + payloadLength) {
          return;
        }

        const payload = buffer.subarray(offset, offset + payloadLength);

        buffer = buffer.subarray(offset + payloadLength);

        if (opCode === 0x08) {
          console.log("🔴 Server sent Close Frame");
          socket.end();
          return;
        }

        if (opCode === 0x01) {
          //console.log(`📨 Message: ${payload.toString("utf8")}`);
          const message = payload.toString("utf8");

          try {
            const update = JSON.parse(message);

            if (update.status === "confirmed") {
              console.log(
                `📩 UPDATE: Order id: ${
                  update.id
                }, [${update.status.toUpperCase()}] at ${update.timestamp}`
              );
              NUMBER_OF_SUCCESSORDERS++;
              resolve();
            } else if (update.status === "failed") {
              console.log(
                `📩 UPDATE: Order id: ${
                  update.id
                }, [${update.status.toUpperCase()}] at ${update.timestamp}`
              );
              NUMBER_OF_FAILEDORDERS++;
              resolve();
            }
          } catch (err) {
            console.error("Error parsing JSON or incomplete body:", err);
          }
        }
      }
    };

    socket.on("error", (err: Error) => {
      console.error("Socket Error:", err);
    });

    socket.on("end", () => {
      console.log("🔴 Socket closed");
    });
  });
};

const runConcurrentLoadTest = async () => {
  console.log(
    `🚀 Starting Load Test with ${TOTAL_ORDERS} concurrent clients...`
  );
  const startTime = Date.now();

  // Create an array of promises
  const clients = Array.from({ length: TOTAL_ORDERS }, (_, i) =>
    runClient(i + 1)
  );

  await Promise.all(clients);

  const duration = (Date.now() - startTime) / 1000;

  console.log("\n========================================");
  console.log("📊 LOAD TEST RESULTS");
  console.log("========================================");
  console.log(`Total Clients: ${TOTAL_ORDERS}`);
  console.log(`✅ Successful:  ${NUMBER_OF_SUCCESSORDERS}`);
  console.log(`❌ Failed:      ${NUMBER_OF_FAILEDORDERS}`);
  console.log(`⏱️ Duration:    ${duration.toFixed(2)}s`);
  console.log(
    `⚡ Throughput:  ${(NUMBER_OF_SUCCESSORDERS / duration).toFixed(2)} req/sec`
  );
  console.log("========================================");
};

runConcurrentLoadTest();
