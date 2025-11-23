import Redis from "ioredis";
import "dotenv/config";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);

const redisConfig = {
  port: REDIS_PORT,
  host: REDIS_HOST,
  maxRetriesPerRequest: null,
};

export const redisConnection = new Redis(redisConfig);
export const publisherConnection = new Redis(redisConfig);
export const subscriberConnection = new Redis(redisConfig);
