import { Worker, Job } from "bullmq";
import { redisConnection, publisherConnection } from "./utils/redisConnection";
import { OrderState, QueueJobData } from "./types";

const publisher = publisherConnection;

const delay = (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

const sendUpdates = async (status: OrderState) => {
  await publisher.publish("order-updates", JSON.stringify(status));
};

const processOrder = async (job: Job<QueueJobData>) => {
  const { orderId, orderDetails } = job.data;
  console.log(job.data);
  try {
    await delay(1000);
    await sendUpdates({ id: orderId, orderDetails, status: "pending" });

    console.log("Successfully published pending status!");
    await delay(1500);

    await sendUpdates({ id: orderId, orderDetails, status: "submitted" });
    console.log("Successfully published submitted status!");
    await delay(3000);

    await sendUpdates({ id: orderId, orderDetails, status: "confirmed" });
    console.log("Successfully published confirmed status!");
  } catch (err) {
    console.log(`Error in sending updates for order: ${orderId}`);
    throw err;
  }
};

const worker = new Worker("order-execution-queue", processOrder, {
  connection: redisConnection,
  concurrency: 10,
});

worker.on("failed", () => {});
