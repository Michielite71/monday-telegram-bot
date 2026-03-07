import { Redis } from "@upstash/redis";

let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

const MAX_HISTORY = 10; // Keep last 10 messages (5 exchanges)

export async function getChatHistory(chatId) {
  if (!redis) return [];
  try {
    const history = await redis.get(`history:${chatId}`);
    return history || [];
  } catch {
    return [];
  }
}

export async function saveChatHistory(chatId, userMessage, assistantMessage) {
  if (!redis) return;
  try {
    let history = await getChatHistory(chatId);

    history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage }
    );

    // Keep only last N messages to save tokens
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    // Expire after 1 hour of inactivity
    await redis.set(`history:${chatId}`, history, { ex: 3600 });
  } catch (err) {
    console.error("Memory save error:", err);
  }
}
