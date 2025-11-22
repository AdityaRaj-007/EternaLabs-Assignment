import Fastify from "fastify";
import { v4 as uuidv4 } from "uuid";
import { WebSocket, WebSocketServer } from "ws";
import { OrderRequest, OrderState } from "./types";
import { orderEngine } from "./engine";
import { subscriberConnection } from "./utils/redisConnection";
import { addOrderToQueue } from "./services/orderQueue";

const PORT = Number(process.env.PORT || 3000);

const redisSubscriber = subscriberConnection;

const activeClients = new Map<string, WebSocket>();

const fastify = Fastify({
  logger: true,
});

// to store orders temporarily.
const orders = new Map<string, OrderState>();

// we are not attaching any server becuase we want to upgrade manually
const websocket = new WebSocketServer({ noServer: true });

// const processOrder = (orderId: string) => {
//   const processStep = (
//     status: OrderStatus,
//     delay: number,
//     next?: () => void
//   ) => {
//     setTimeout(() => {
//       const order = orders.get(orderId);

//       if (!order) return;

//       fastify.log.info(
//         { orderId: order.id, status: status },
//         "Status updated!"
//       );

//       order.status = status;

//       if (order.socket && order.socket.readyState === WebSocket.OPEN) {
//         try {
//           order.socket.send(
//             JSON.stringify({
//               orderId: order.id,
//               status,
//               timestamp: new Date().toISOString(),
//             })
//           );
//         } catch (err) {
//           fastify.log.error(
//             { err, orderId: order.id },
//             "Failed to send status update!"
//           );
//         }
//       }

//       if (next) next();

//       if (status === "confirmed") {
//         if (order.socket) {
//           try {
//             order.socket.close();
//           } catch {}
//         }

//         orders.delete(orderId);
//       }
//     }, delay);
//   };

//   processStep("pending", 1000, () => {
//     processStep("submitted", 1500, () => {
//       processStep("confirmed", 3000);
//     });
//   });
// };

redisSubscriber.subscribe("order-updates");
redisSubscriber.on("message", (channel, message) => {
  if (channel === "order-updates") {
    const update: OrderState = JSON.parse(message);

    const activeSocketForOrder = activeClients.get(update.id);

    if (
      activeSocketForOrder &&
      activeSocketForOrder.readyState === WebSocket.OPEN
    ) {
      try {
        activeSocketForOrder.send(
          JSON.stringify({
            id: update.id,
            status: update.status,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.log(`Failed to send status update for order: ${update.id}`);
      }
    }
  }
});

fastify.post<{ Body: OrderRequest }>(
  "/api/orders/execute",
  async (request, reply) => {
    const { inputToken, outputToken, amount } = request.body;

    if (
      !inputToken ||
      !outputToken ||
      typeof amount !== "number" ||
      amount <= 0
    ) {
      return reply.code(400).send({
        error:
          "Invalid error data. Provided all the required information to execute the order!",
      });
    }

    const orderId = uuidv4();

    // orders.set(orderId, {
    //   id: orderId,
    //   orderDetails: { inputToken, outputToken, amount },
    //   status: "pending",
    // });

    // orderEngine.createOrder(orderId, { inputToken, outputToken, amount });
    const orderDetails = { inputToken, outputToken, amount };
    addOrderToQueue(orderId, orderDetails);

    // processOrder(orderId);

    // orderEngine.processOrder(orderId);

    reply.hijack();

    // we need to keep the connection alive to upgrade the same connection to websocket;
    reply.raw.writeHead(200, {
      "Content-Type": "application/json",
      Connection: "keep-alive",
      "Keep-Alive": "timeout=10",
    });

    return reply.raw.end(
      JSON.stringify({ orderId, message: "Order placed successfully!" })
    );
  }
);

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    fastify.log.info(`Server running at http://localhost:${PORT}`);

    const server = fastify.server;

    // manual handling an upgrade event from the client.
    server.on("upgrade", (request, socket, head) => {
      try {
        const url = new URL(
          request.url ?? "",
          `http://${request.headers.host}`
        );

        if (url.pathname != "/api/orders/execute") {
          fastify.log.error(
            "Incorrect pathname, please check your connection."
          );
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }

        const orderId = url.searchParams.get("orderId");

        // if (!orderId || !orderEngine.getOrderDetails(orderId)) {
        //   socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        //   socket.destroy();
        //   return;
        // }

        if (!orderId) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }

        websocket.handleUpgrade(request, socket, head, (ws) => {
          //   const order = orderEngine.getOrderDetails(orderId);

          //   if (!order) {
          //     socket.destroy();
          //     return;
          //   }

          //   order.socket = ws;
          //orderEngine.attachSocketToOrder(orderId, ws);

          activeClients.set(orderId, ws);

          fastify.log.info(
            "Connection upgraded to websocket for live updates!"
          );

          //   ws.on("close", () => {
          //     fastify.log.info(
          //       { orderId: order.id, status: order.status },
          //       "Client asked to close the connection! "
          //     );
          //   });

          //   ws.on("error", (err) => {
          //     fastify.log.error(
          //       { err, orderId: order.id },
          //       "WebSocket connection error"
          //     );
          //   });
        });
      } catch (err) {
        try {
          socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        } catch {}
        socket.destroy();
      }
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
