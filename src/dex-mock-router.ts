import { OrderRequest } from "./types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class MockDexRouter {
  private basePrice = 150;

  private getRaydiumQuote = async (
    tokenIn: string,
    tokenOut: string,
    amount: number
  ) => {
    await delay(500);

    return {
      venue: "Radium",
      price: this.basePrice * (0.98 + Math.random() * 0.04),
      fee: 0.003,
    };
  };

  private getMeteoraQuote = async (
    tokenIn: string,
    tokenOut: string,
    amount: number
  ) => {
    await delay(700);

    return {
      venue: "Meteora",
      price: this.basePrice * (0.98 + Math.random() * 0.04),
      fee: 0.003,
    };
  };

  private generateMockTxHash = () => {
    return (
      "0x" +
      Math.random().toString(16).substring(2, 15) +
      Date.now().toString(16)
    );
  };

  getBestRoute = async (tokenIn: string, tokenOut: string, amount: number) => {
    console.log("Fetching Radyium & Meteora Quotes");

    const [raydium, meteora] = await Promise.all([
      this.getRaydiumQuote(tokenIn, tokenOut, amount),
      this.getMeteoraQuote(tokenIn, tokenOut, amount),
    ]);

    return raydium.price > meteora.price ? raydium : meteora;
  };

  executeSwap = async (dex: string, order: OrderRequest) => {
    await delay(2000 + Math.random() * 1000);

    let dexPrice;
    if (dex === "raydium") {
      dexPrice = (
        await this.getRaydiumQuote(
          order.inputToken,
          order.outputToken,
          order.amount
        )
      ).price;
    } else {
      dexPrice = (
        await this.getMeteoraQuote(
          order.inputToken,
          order.outputToken,
          order.amount
        )
      ).price;
    }

    return {
      txHash: this.generateMockTxHash(),
      executedPrice: dexPrice * order.amount,
    };
  };
}

export const mockDexRouter = new MockDexRouter();
