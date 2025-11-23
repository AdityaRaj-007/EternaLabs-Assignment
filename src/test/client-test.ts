import http from "http";
import WebSocket from "ws";
import "dotenv/config";

const PORT = process.env.PORT;
const HOST = process.env.HOST;
const ENDPOINT = process.env.ENDPOINT;

console.log(`http://${HOST}:${PORT}${ENDPOINT}`);

const placeOrderAndWaitForUpdates = () => {
  console.log(` 1. Placing Order via HTTP POST to ${ENDPOINT}...`);
  const req = http.request(
    {
      host: HOST,
      port: PORT,
      path: ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
      agent: new http.Agent({ keepAlive: true, maxSockets: 1 }),
    },
    (res) => {
      // extracting the socket so that we can upgrade the connect on the same.
      const socket = res.socket;
      console.log(socket);
      console.log(socket?.localPort);

      let buffer = "";

      res.on("data", (data) => (buffer += data));

      res.on("end", () => {
        if (res.statusCode !== 200) {
          console.error(
            `❌ Server responded with Status Code: ${res.statusCode}`
          );
          console.error(`❌ Response Body: \n${buffer}`);
          console.error(
            "👉 Hint: Check if SERVER path and CLIENT path match exactly."
          );
          return;
        }

        try {
          console.log(`Response from the server is ${buffer}`);
          const data = JSON.parse(buffer);
          const orderId = data.orderId;

          console.log(`2. Order place successfully with orderId: ${orderId}`);

          console.log(
            `Socket Info: Port Number ${socket?.localPort} (Reusing to upgrade)`
          );

          console.log(
            `3. Upgrading the same socket connection to a websocket...`
          );

          const websocketUrl = `ws://${HOST}:${PORT}${ENDPOINT}?orderId=${orderId}`;

          console.log(websocketUrl);

          const ws = new WebSocket(websocketUrl, { socket: socket } as any);

          ws.on("open", () => {
            console.log("4. Connection upgraded...");
          });

          ws.on("message", (msg) => {
            const update = JSON.parse(msg.toString());
            console.log(
              `📩 UPDATE: [${update.status.toUpperCase()}] at ${
                update.timestamp
              }`
            );

            if (update.status === "confirmed" || update.status === "failed") {
              console.log(`Order ${update.status}, closing the connection.`);
              ws.close();
            }
          });

          ws.on("error", (err) => console.error("Websocket error", err));

          ws.on("close", () => {
            console.log("🔴 WebSocket Closed");
          });
        } catch (err) {
          console.error("❌ JSON Parse Error:", err);
          console.log("Raw Buffer:", buffer);
        }
      });
    }
  );

  req.write(
    JSON.stringify({ inputToken: "SOL", outputToken: "USDC", amount: 3 })
  );

  req.end();
};

placeOrderAndWaitForUpdates();
