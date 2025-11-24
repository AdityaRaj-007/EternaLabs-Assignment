import { Worker, Job } from "bullmq";
import { redisConnection, publisherConnection } from "./utils/redisConnection";
import { OrderState, QueueJobData } from "./types";
import { mockDexRouter } from "./dex-mock-router";

const publisher = publisherConnection;

const FAILURE_RATES = 0;

const simulateFailedOrder = (job: Job<QueueJobData>) => {
  //console.log(`Attempt no: ${job.attemptsMade}`);
  const rate = 1 - Math.pow(1 - FAILURE_RATES, job.attemptsMade + 1);
  //console.log(`Failure rate: ${rate}`);
  return Math.random() < rate;
};

const delay = (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

const sendUpdates = async (status: OrderState) => {
  console.log(`Successfully published ${status.status} status!`);
  await publisher.publish("order-updates", JSON.stringify(status));
};

const processOrder = async (job: Job<QueueJobData>) => {
  const { orderId, orderDetails } = job.data;
  console.log(job.data);
  try {
    await delay(1000);
    await sendUpdates({ id: orderId, orderDetails, status: "pending" });
    //console.log("Successfully published pending status!");

    await delay(1000);
    const router = await mockDexRouter.getBestRoute(
      orderDetails.inputToken,
      orderDetails.outputToken,
      orderDetails.amount
    );
    await sendUpdates({
      id: orderId,
      orderDetails,
      status: "routing",
      venue: router.venue,
    });
    //console.log("Successfully published routing status!");

    await delay(1000);
    await sendUpdates({ id: orderId, orderDetails, status: "building" });
    //console.log("Successfully published building status!");

    await delay(1500);
    await sendUpdates({ id: orderId, orderDetails, status: "submitted" });
    //console.log("Successfully published submitted status!");

    if (simulateFailedOrder(job)) {
      throw new Error("Mock solana RPC timeout");
    }

    await delay(2000);
    const swapDetails = await mockDexRouter.executeSwap(
      router.venue,
      orderDetails
    );
    await sendUpdates({
      id: orderId,
      orderDetails,
      status: "confirmed",
      venue: router.venue,
      price: swapDetails.executedPrice,
      txHash: swapDetails.txHash,
    });
    //console.log("Successfully published confirmed status!");
  } catch (err) {
    console.log(
      `Job Failed (Simulation or Error) for order: ${orderId}. Reason: ${
        (err as Error).message
      }`
    );
    await sendUpdates({ id: orderId, orderDetails, status: "queued" });
    return Promise.reject(err);
  }
};

const worker = new Worker("order-execution-queue", processOrder, {
  connection: redisConnection,
  concurrency: 10,
});

worker.on("active", (job) => {
  console.log(
    `Job started: ${job.data.orderId} | Attempt ${job.attemptsMade + 1}`
  );
});

worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    await sendUpdates({
      id: job.data.orderId,
      orderDetails: job.data.orderDetails,
      status: "failed",
    });
  }
});
