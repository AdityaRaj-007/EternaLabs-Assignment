import Redis from "ioredis";

const redisConfig = {
  port: 6379,
  host: "127.0.0.1",
  maxRetriesPerRequest: null,
};

export const redisConnection = new Redis(redisConfig);
export const publisherConnection = new Redis(redisConfig);
export const subscriberConnection = new Redis(redisConfig);
