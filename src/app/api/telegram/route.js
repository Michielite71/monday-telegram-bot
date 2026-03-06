import { NextResponse } from "next/server";
import { sendMessage, sendTypingAction } from "@/lib/telegram";
import { fetchAllMerchants, getMerchantSummary, formatMerchantDetail } from "@/lib/monday";
import { askClaude } from "@/lib/claude";
import { isAuthorized, authorize, deauthorize } from "@/lib/auth";

async function handleAuth(chatId, secret) {
  if (!secret) {
    await sendMessage(chatId, "Usage: `/auth your_secret_key`");
    return;
  }

  if (authorize(chatId, secret)) {
    await sendMessage(chatId,
      `✅ *Authorized!*
You now have access to the CRM bot.
Type /help to see available commands.`
    );
  } else {
    await sendMessage(chatId, "❌ Invalid key. Access denied.");
  }
}

async function handleStart(chatId) {
  if (!isAuthorized(chatId)) {
    await sendMessage(chatId,
      `🔒 *S-Interio CRM Bot*
━━━━━━━━━━━━━━━
This bot requires authentication.

Use: \`/auth your_secret_key\`

Contact your admin for access.`
    );
    return;
  }

  await sendMessage(chatId,
    `👋 *S-Interio CRM Bot*
━━━━━━━━━━━━━━━
I can help you monitor the merchant pipeline.

*Commands:*
/summary - Pipeline overview
/search \`name\` - Find a merchant
/stuck - Show stuck merchants
/logout - Revoke access
/help - All commands

Or just *ask me anything* in natural language:
_"How many FX merchants are in onboarding?"_
_"Que merchants llevan mas tiempo sin avanzar?"_`
  );
}

async function handleHelp(chatId) {
  await sendMessage(chatId,
    `📖 *Available Commands*
━━━━━━━━━━━━━━━
/summary - Pipeline overview with counts
/search \`name\` - Search merchant by name
/stuck - List all stuck/paused merchants
/logout - Revoke your access
/help - Show this help

💬 *Natural Language:*
Just type any question about your merchants and I'll analyze the data for you.

Examples:
• _"Status of VPTrade"_
• _"Cuantos merchants hay en integrating?"_
• _"Which merchants completed KYC?"_
• _"Dame un resumen de los merchants de Betting"_`
  );
}

async function handleLogout(chatId) {
  deauthorize(chatId);
  await sendMessage(chatId, "🔒 Access revoked. Use `/auth` to log in again.");
}

async function handleSummary(chatId) {
  await sendTypingAction(chatId);
  const items = await fetchAllMerchants();
  const summary = getMerchantSummary(items);

  let text = `📊 *Pipeline Summary*
━━━━━━━━━━━━━━━
Total merchants: *${summary.total}*

📁 *By Group:*\n`;

  for (const [group, count] of Object.entries(summary.groups)) {
    text += `  • ${group}: *${count}*\n`;
  }

  text += `\n📈 *By Stage:*\n`;
  for (const stage of summary.stageStats) {
    text += `  ${stage.label}: ✅${stage.done} 🔄${stage.inProgress} 🔴${stage.stuck}\n`;
  }

  await sendMessage(chatId, text);
}

async function handleSearch(chatId, args) {
  if (!args) {
    await sendMessage(chatId, "Usage: /search `merchant name`");
    return;
  }

  await sendTypingAction(chatId);
  const items = await fetchAllMerchants();
  const query = args.toLowerCase();
  const matches = items.filter((i) => i.name.toLowerCase().includes(query));

  if (matches.length === 0) {
    await sendMessage(chatId, `No merchants found matching "${args}"`);
    return;
  }

  for (const item of matches.slice(0, 5)) {
    await sendMessage(chatId, formatMerchantDetail(item));
  }

  if (matches.length > 5) {
    await sendMessage(chatId, `_...and ${matches.length - 5} more results_`);
  }
}

async function handleStuck(chatId) {
  await sendTypingAction(chatId);
  const items = await fetchAllMerchants();

  const stuckItems = items.filter((item) => {
    return item.column_values.some((col) => {
      const val = col.text;
      return val === "PAUSED" || val === "Stuck" || val === "Not appproved" || val === "Never/Stopped";
    });
  });

  if (stuckItems.length === 0) {
    await sendMessage(chatId, "No stuck merchants found! 🎉");
    return;
  }

  let text = `🔴 *Stuck Merchants (${stuckItems.length})*
━━━━━━━━━━━━━━━\n`;

  for (const item of stuckItems.slice(0, 10)) {
    const vertical = item.column_values.find((c) => c.id === "color_mksax617");
    const group = item.group.title;
    const stuckStages = [];
    item.column_values.forEach((col) => {
      if (col.text === "PAUSED" || col.text === "Stuck" || col.text === "Not appproved") {
        stuckStages.push(col.text);
      }
    });
    text += `\n• *${item.name}* (${vertical?.text || "N/A"})
  📁 ${group} | 🔴 ${stuckStages.join(", ")}`;
  }

  if (stuckItems.length > 10) {
    text += `\n\n_...and ${stuckItems.length - 10} more_`;
  }

  await sendMessage(chatId, text);
}

async function handleNaturalLanguage(chatId, text) {
  await sendTypingAction(chatId);

  const items = await fetchAllMerchants();

  const compactData = items.map((item) => ({
    name: item.name,
    group: item.group.title,
    columns: Object.fromEntries(
      item.column_values
        .filter((c) => c.text)
        .map((c) => [c.id, c.text])
    ),
  }));

  const response = await askClaude(text, compactData);

  if (response.length > 4000) {
    const chunks = response.match(/.{1,4000}/gs);
    for (const chunk of chunks) {
      await sendMessage(chatId, chunk);
    }
  } else {
    await sendMessage(chatId, response);
  }
}

const COMMANDS = {
  "/start": handleStart,
  "/help": handleHelp,
  "/summary": handleSummary,
  "/search": handleSearch,
  "/stuck": handleStuck,
  "/logout": handleLogout,
};

// Commands that don't require auth
const PUBLIC_COMMANDS = new Set(["/start", "/auth"]);

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body.message;

    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    const parts = text.split(" ");
    const command = parts[0].toLowerCase().split("@")[0];
    const args = parts.slice(1).join(" ");

    // Handle /auth separately (always available)
    if (command === "/auth") {
      await handleAuth(chatId, args);
      return NextResponse.json({ ok: true });
    }

    // Handle /start (shows auth prompt if not authorized)
    if (command === "/start") {
      await handleStart(chatId);
      return NextResponse.json({ ok: true });
    }

    // All other commands/messages require auth
    if (!isAuthorized(chatId)) {
      await sendMessage(chatId,
        "🔒 You need to authenticate first.\nUse: `/auth your_secret_key`"
      );
      return NextResponse.json({ ok: true });
    }

    // Handle commands
    if (COMMANDS[command]) {
      await COMMANDS[command](chatId, args);
    } else {
      await handleNaturalLanguage(chatId, text);
    }
  } catch (err) {
    console.error("Telegram webhook error:", err);
  }

  return NextResponse.json({ ok: true });
}
