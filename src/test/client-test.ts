import net from "net";
import crypto from "crypto";
import "dotenv/config";

const PORT = Number(process.env.PORT);
const HOST = process.env.HOST || "127.0.0.1";
const ENDPOINT = process.env.ENDPOINT;

console.log(`http://${HOST}:${PORT}${ENDPOINT}`);

// const placeOrderAndWaitForUpdates = () => {
//   console.log(` 1. Placing Order via HTTP POST to ${ENDPOINT}...`);
//   const req = http.request(
//     {
//       host: HOST,
//       port: PORT,
//       path: ENDPOINT,
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         Connection: "keep-alive",
//       },
//       agent: new http.Agent({ keepAlive: true, maxSockets: 1 }),
//     },
//     (res) => {
//       // extracting the socket so that we can upgrade the connect on the same.
//       const socket = res.socket;
//       console.log(socket);
//       console.log(socket?.localPort);

//       let buffer = "";

//       res.on("data", (data) => (buffer += data));

//       res.on("end", () => {
//         if (res.statusCode !== 200) {
//           console.error(
//             `❌ Server responded with Status Code: ${res.statusCode}`
//           );
//           console.error(`❌ Response Body: \n${buffer}`);
//           console.error(
//             "👉 Hint: Check if SERVER path and CLIENT path match exactly."
//           );
//           return;
//         }

//         try {
//           console.log(`Response from the server is ${buffer}`);
//           const data = JSON.parse(buffer);
//           const orderId = data.orderId;

//           console.log(`2. Order place successfully with orderId: ${orderId}`);

//           console.log(
//             `Socket Info: Port Number ${socket?.localPort} (Reusing to upgrade)`
//           );

//           console.log(
//             `3. Upgrading the same socket connection to a websocket...`
//           );

//           const websocketUrl = `ws://${HOST}:${PORT}${ENDPOINT}?orderId=${orderId}`;

//           console.log(websocketUrl);

//           const ws = new WebSocket(websocketUrl, { socket: socket } as any);

//           ws.on("open", () => {
//             console.log("4. Connection upgraded...");
//           });

//           ws.on("message", (msg) => {
//             const update = JSON.parse(msg.toString());
//             console.log(
//               `📩 UPDATE: [${update.status.toUpperCase()}] at ${
//                 update.timestamp
//               }`
//             );

//             if (update.status === "confirmed" || update.status === "failed") {
//               console.log(`Order ${update.status}, closing the connection.`);
//               ws.close();
//             }
//           });

//           ws.on("error", (err) => console.error("Websocket error", err));

//           ws.on("close", () => {
//             console.log("🔴 WebSocket Closed");
//           });
//         } catch (err) {
//           console.error("❌ JSON Parse Error:", err);
//           console.log("Raw Buffer:", buffer);
//         }
//       });
//     }
//   );

//   req.write(
//     JSON.stringify({ inputToken: "SOL", outputToken: "USDC", amount: 3 })
//   );

//   req.end();
// };

// placeOrderAndWaitForUpdates();

function createWebSocketKey() {
  return crypto.randomBytes(16).toString("base64");
}

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
  console.log("3. Sending WebSocket upgrade request on the same connection.");
  const websocketKey = createWebSocketKey();

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
        console.log(
          `📩 UPDATE: Order id: ${
            update.id
          }, [${update.status.toUpperCase()}] at ${update.timestamp}`
        );
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
