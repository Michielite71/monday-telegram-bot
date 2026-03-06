const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendMessage(chatId, text, options = {}) {
  const res = await fetch(`${BASE_URL}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      ...options,
    }),
  });
  return res.json();
}

export async function sendTypingAction(chatId) {
  await fetch(`${BASE_URL}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: "typing",
    }),
  });
}

// Keeps sending "typing..." every 4 seconds while a promise is running
export async function withTypingIndicator(chatId, asyncFn) {
  const interval = setInterval(() => sendTypingAction(chatId), 4000);
  await sendTypingAction(chatId);
  try {
    return await asyncFn();
  } finally {
    clearInterval(interval);
  }
}

export async function setWebhook(url) {
  const res = await fetch(`${BASE_URL}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}
