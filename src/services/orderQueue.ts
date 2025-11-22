import { Queue } from "bullmq";
import { redisConnection } from "../utils/redisConnection";
import { OrderRequest } from "../types";

const orderQueue = new Queue("order-execution-queue", {
  connection: redisConnection,
});

export const addOrderToQueue = async (orderId: string, data: OrderRequest) => {
  console.log(data);
  return await orderQueue.add(
    "market-order",
    { orderId, orderDetails: data },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: true,
    }
  );
};
