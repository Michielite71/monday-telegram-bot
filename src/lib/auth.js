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
    try {
      const val = await redis.get(`auth:${chatId}`);
      if (val) return true;
    } catch (err) {
      console.error("Redis read error:", err);
    }
  }
  return memoryChats.has(chatId);
}

export async function authorize(chatId, secret) {
  if (secret === AUTH_SECRET) {
    memoryChats.add(chatId);
    if (redis) {
      try {
        await redis.set(`auth:${chatId}`, "1");
      } catch (err) {
        console.error("Redis write error:", err);
      }
    }
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

// Image rate limit: max per day per chat
const MAX_IMAGES_PER_DAY = 10;

export async function checkImageLimit(chatId) {
  if (!redis) return { allowed: true, remaining: MAX_IMAGES_PER_DAY };

  try {
    const key = `img:${chatId}:${new Date().toISOString().slice(0, 10)}`;
    const count = (await redis.get(key)) || 0;

    if (count >= MAX_IMAGES_PER_DAY) {
      return { allowed: false, remaining: 0 };
    }

    await redis.incr(key);
    await redis.expire(key, 86400);
    return { allowed: true, remaining: MAX_IMAGES_PER_DAY - count - 1 };
  } catch (err) {
    console.error("Redis image limit error:", err);
    return { allowed: true, remaining: MAX_IMAGES_PER_DAY };
  }
}
