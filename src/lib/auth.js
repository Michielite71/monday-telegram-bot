const AUTH_SECRET = process.env.BOT_AUTH_SECRET;

// Persists while the serverless function is warm (usually minutes to hours).
// If it cold-starts, users just /auth again - simple and no external DB needed.
const authorizedChats = new Set();

export function isAuthorized(chatId) {
  return authorizedChats.has(chatId);
}

export function authorize(chatId, secret) {
  if (secret === AUTH_SECRET) {
    authorizedChats.add(chatId);
    return true;
  }
  return false;
}

export function deauthorize(chatId) {
  authorizedChats.delete(chatId);
}
