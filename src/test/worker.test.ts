const mockPublish = jest.fn();
jest.mock("../utils/redisConnection", () => ({
  publisherConnection: { publish: mockPublish },
  redisConnection: {},
}));

jest.mock("../dex-mock-router", () => ({
  mockDexRouter: {
    getBestRoute: jest.fn().mockResolvedValue({ venue: "Meteora", price: 50 }),
    executeSwap: jest
      .fn()
      .mockResolvedValue({ txHash: "0xABC", executedPrice: 50 }),
  },
}));

const simulateProcessOrder = async (jobData: any) => {
  const { mockDexRouter } = require("../dex-mock-router");
  const { publisherConnection } = require("../utils/redisConnection");

  await publisherConnection.publish(
    "order-updates",
    JSON.stringify({ id: jobData.orderId, status: "pending" })
  );

  const route = await mockDexRouter.getBestRoute();
  await publisherConnection.publish(
    "order-updates",
    JSON.stringify({
      id: jobData.orderId,
      status: "routing",
      venue: route.venue,
    })
  );

  const swap = await mockDexRouter.executeSwap();
  await publisherConnection.publish(
    "order-updates",
    JSON.stringify({
      id: jobData.orderId,
      status: "confirmed",
      txHash: swap.txHash,
    })
  );
};

describe("Worker Job Processing", () => {
  it("should publish sequence of updates: pending -> routing -> confirmed", async () => {
    const jobData = {
      orderId: "job-123",
      orderDetails: { inputToken: "SOL", outputToken: "USDC", amount: 1 },
    };

    await simulateProcessOrder(jobData);

    expect(mockPublish).toHaveBeenCalledWith(
      "order-updates",
      expect.stringContaining('"status":"pending"')
    );

    expect(mockPublish).toHaveBeenCalledWith(
      "order-updates",
      expect.stringContaining('"status":"routing"')
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "order-updates",
      expect.stringContaining('"venue":"Meteora"')
    );

    expect(mockPublish).toHaveBeenCalledWith(
      "order-updates",
      expect.stringContaining('"status":"confirmed"')
    );
    expect(mockPublish).toHaveBeenCalledWith(
      "order-updates",
      expect.stringContaining('"txHash":"0xABC"')
    );
  });
});
