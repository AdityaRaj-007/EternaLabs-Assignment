import { mockDexRouter } from "../dex-mock-router";

describe("Dex Mock Router", () => {
  it("should return a quote containing a venue and price", async () => {
    const quote = await mockDexRouter.getBestRoute("SOL", "USDC", 1);
    expect(quote).toHaveProperty("venue");
    expect(quote).toHaveProperty("price");
    expect(typeof quote.price).toBe("number");
    expect(["Radium", "Meteora"]).toContain(quote.venue);
  });

  it("should execute a swap and return a txHash", async () => {
    const order = { inputToken: "SOL", outputToken: "USDC", amount: 1 };
    const result = await mockDexRouter.executeSwap("Radium", order);

    expect(result).toHaveProperty("txHash");
    expect(result.txHash).toMatch(/^0x/);
    expect(result.executedPrice).toBeGreaterThan(0);
  });
});
