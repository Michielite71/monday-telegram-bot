import { Redis } from "@upstash/redis";

const AUTH_SECRET = (process.env.BOT_AUTH_SECRET || "").trim();

// Use Upstash Redis for persistent auth, fallback to in-memory
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// In-memory fallback
const memoryChats = new Set();

export async function isAuthorized(chatId) {
  if (redis) {
    const val = await redis.get(`auth:${chatId}`);
    return val === "1";
  }
  return memoryChats.has(chatId);
}

export async function authorize(chatId, secret) {
  if (secret === AUTH_SECRET) {
    if (redis) {
      await redis.set(`auth:${chatId}`, "1");
    }
    memoryChats.add(chatId);
    return true;
  }
  return false;
}

export async function deauthorize(chatId) {
  if (redis) {
    await redis.del(`auth:${chatId}`);
  }
  memoryChats.delete(chatId);
}
