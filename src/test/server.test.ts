const mockDb = {
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
};

jest.mock("../db/config", () => ({
  db: mockDb,
}));

jest.mock("../db/schema", () => ({
  orderTable: { orderId: "orderId_column" },
}));

const mockAddOrderToQueue = jest.fn();
jest.mock("../services/orderQueue", () => ({
  addOrderToQueue: mockAddOrderToQueue,
}));

jest.mock("../utils/redisConnection", () => ({
  subscriberConnection: {
    subscribe: jest.fn(),
    on: jest.fn(),
  },
}));

import {
  buildServer,
  handleUpgrade,
  handleRedisMessage,
  activeClients,
} from "../server";
import { WebSocket, WebSocketServer } from "ws";
import { EventEmitter } from "events";

describe("Server Integration & Logic", () => {
  let app: any;

  beforeAll(() => {
    app = buildServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    activeClients.clear();
    jest.clearAllMocks();
  });

  describe("POST /api/orders/execute", () => {
    it("should place an order successfully (200 OK)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/orders/execute",
        payload: {
          inputToken: "SOL",
          outputToken: "USDC",
          amount: 5,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json).toHaveProperty("orderId");
      expect(json.message).toBe("Order placed successfully!");

      expect(mockAddOrderToQueue).toHaveBeenCalledTimes(1);
    });

    it("should fail with 400 if amount is invalid", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/orders/execute",
        payload: {
          inputToken: "SOL",
          outputToken: "USDC",
          amount: -5,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("handleUpgrade Logic", () => {
    let mockSocket: any;
    let mockHead: Buffer;
    let mockWss: any;

    beforeEach(() => {
      mockSocket = {
        write: jest.fn(),
        destroy: jest.fn(),
      };
      mockHead = Buffer.from("");
      mockWss = {
        handleUpgrade: jest.fn((req, socket, head, cb) => {
          const ws = new EventEmitter();
          cb(ws);
        }),
      };
    });

    it("should fail upgrade if path is incorrect (404)", () => {
      const req = { url: "/wrong/path", headers: { host: "localhost" } } as any;

      handleUpgrade(req, mockSocket, mockHead, mockWss, activeClients);

      expect(mockSocket.write).toHaveBeenCalledWith(
        expect.stringContaining("404")
      );
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it("should fail upgrade if orderId is missing (404)", () => {
      const req = {
        url: "/api/orders/execute",
        headers: { host: "localhost" },
      } as any;

      handleUpgrade(req, mockSocket, mockHead, mockWss, activeClients);

      expect(mockSocket.write).toHaveBeenCalledWith(
        expect.stringContaining("404")
      );
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it("should upgrade connection if URL is valid", () => {
      const req = {
        url: "/api/orders/execute?orderId=test-123",
        headers: { host: "localhost" },
      } as any;

      handleUpgrade(req, mockSocket, mockHead, mockWss, activeClients);

      expect(mockWss.handleUpgrade).toHaveBeenCalled();
      expect(activeClients.has("test-123")).toBe(true);
    });
  });

  describe("handleRedisMessage Logic", () => {
    const loggerMock = { error: jest.fn(), info: jest.fn() };

    it("should insert new order into DB when status is 'pending'", async () => {
      const message = JSON.stringify({
        id: "order-1",
        status: "pending",
        orderDetails: { inputToken: "SOL", outputToken: "USDC", amount: 1 },
      });

      mockDb.where.mockResolvedValueOnce([]);

      await handleRedisMessage(message, activeClients, loggerMock as any);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "order-1",
          orderStatus: "pending",
        })
      );
    });

    it("should send update to active WebSocket client", async () => {
      const message = JSON.stringify({
        id: "order-1",
        status: "routing",
      });

      const mockWs = { readyState: WebSocket.OPEN, send: jest.fn() };
      activeClients.set("order-1", mockWs as any);

      await handleRedisMessage(message, activeClients, loggerMock as any);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining("routing")
      );
    });

    it("should update DB and close socket when status is 'confirmed'", async () => {
      jest.useFakeTimers();

      const message = JSON.stringify({
        id: "order-1",
        status: "confirmed",
        venue: "Raydium",
        price: 100,
      });

      const mockWs = {
        readyState: WebSocket.OPEN,
        close: jest.fn(),
        send: jest.fn(),
      };
      activeClients.set("order-1", mockWs as any);

      await handleRedisMessage(message, activeClients, loggerMock as any);

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          orderStatus: "confirmed",
        })
      );

      jest.runAllTimers();
      expect(mockWs.close).toHaveBeenCalled();
      expect(activeClients.has("order-1")).toBe(false);

      jest.useRealTimers();
    });
  });
});
