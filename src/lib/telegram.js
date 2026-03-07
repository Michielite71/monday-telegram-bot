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

export async function getFileUrl(fileId) {
  const res = await fetch(`${BASE_URL}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = await res.json();
  if (!data.ok) return null;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
}

export async function downloadFile(fileId) {
  const url = await getFileUrl(fileId);
  if (!url) return null;
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

export async function sendPhoto(chatId, photoUrl, caption = "") {
  const res = await fetch(`${BASE_URL}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "Markdown",
    }),
  });
  return res.json();
}

export async function setWebhook(url) {
  const res = await fetch(`${BASE_URL}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}
