import Fastify, { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { WebSocket, WebSocketServer } from "ws";
import { IncomingMessage } from "http";
import { Duplex } from "stream";
import { OrderRequest, OrderState } from "./types";
import { subscriberConnection } from "./utils/redisConnection";
import { addOrderToQueue } from "./services/orderQueue";
import { db } from "./db/config";
import { orderTable } from "./db/schema";
import "dotenv/config";
import { eq } from "drizzle-orm";

const PORT = Number(process.env.PORT || 3000);

export interface ILogger {
  info(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
}

export const activeClients = new Map<string, WebSocket>();
export const websocketServer = new WebSocketServer({ noServer: true });

export const handleRedisMessage = async (
  message: string,
  clients: Map<string, WebSocket>,
  logger: ILogger = console
) => {
  try {
    const update: OrderState = JSON.parse(message);
    const activeSocket = clients.get(update.id);

    if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
      try {
        activeSocket.send(
          JSON.stringify({
            id: update.id,
            status: update.status,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        logger.error(`Failed to send socket update for ${update.id}`);
      }
    }

    if (update.status === "pending" || update.status === "queued") {
      const existingOrder = await db
        .select()
        .from(orderTable)
        .where(eq(orderTable.orderId, update.id));

      if (existingOrder.length === 0) {
        await db.insert(orderTable).values({
          orderId: update.id,
          inputToken: update.orderDetails.inputToken,
          outputToken: update.orderDetails.outputToken,
          amount: update.orderDetails.amount,
          orderStatus: update.status,
        });
      }
    }

    if (update.status === "confirmed" || update.status === "failed") {
      await db
        .update(orderTable)
        .set({
          orderStatus: update.status,
          updated_at: new Date(),
          venue: update.venue || null,
          price: update.price ? String(update.price) : null,
        })
        .where(eq(orderTable.orderId, update.id));

      if (activeSocket) {
        setTimeout(() => {
          if (activeSocket.readyState === WebSocket.OPEN) activeSocket.close();
          clients.delete(update.id);
        }, 500);
      }
    }
  } catch (err) {
    logger.error(`Error processing Redis message: ${err}`);
  }
};

export const handleUpgrade = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  clients: Map<string, WebSocket>,
  logger: ILogger = console
) => {
  try {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);

    if (url.pathname !== "/api/orders/execute") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const orderId = url.searchParams.get("orderId");
    if (!orderId) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      clients.set(orderId, ws);
      logger.info(`Connection upgraded for order: ${orderId}`);

      ws.on("close", () => {
        clients.delete(orderId);
        logger.info(`WS closed: ${orderId}`);
      });
    });
  } catch (err) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
  }
};

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.post<{ Body: OrderRequest }>(
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
            "Invalid data. Provide inputToken, outputToken, and valid amount.",
        });
      }

      const orderId = uuidv4();
      const orderDetails = { inputToken, outputToken, amount };

      await addOrderToQueue(orderId, orderDetails);

      const responseBody = JSON.stringify({
        orderId,
        message: "Order placed successfully!",
      });

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/json",
        Connection: "keep-alive",
        "Keep-Alive": "timeout=10",
        "Content-Length": Buffer.byteLength(responseBody),
      });
      reply.raw.write(responseBody);
      return reply.raw.end();
    }
  );

  app.get("/api/test", (request, reply) => {
    return reply.code(200).send({ message: "Backend is running!" });
  });

  return app;
}

const start = async () => {
  const fastify = buildServer();

  try {
    const redisSubscriber = subscriberConnection;
    redisSubscriber.subscribe("order-updates");
    redisSubscriber.on("message", (channel, message) => {
      if (channel === "order-updates") {
        fastify.log.info("Received order status message.");
        handleRedisMessage(message, activeClients, fastify.log);
      }
    });

    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    fastify.log.info(`Server running at http://localhost:${PORT}`);

    fastify.server.on("upgrade", (request, socket, head) => {
      fastify.log.info("Received request to upgrade the connection!");
      handleUpgrade(
        request,
        socket,
        head,
        websocketServer,
        activeClients,
        fastify.log
      );
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module && process.env.NODE_ENV !== "test") {
  start();
}
