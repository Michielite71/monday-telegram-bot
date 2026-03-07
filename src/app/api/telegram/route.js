import { NextResponse } from "next/server";
import { sendMessage, sendTypingAction, withTypingIndicator, downloadFile } from "@/lib/telegram";
import { fetchAllMerchants, getMerchantSummary, formatMerchantDetail } from "@/lib/monday";
import { askClaude } from "@/lib/claude";
import { isAuthorized, authorize, deauthorize } from "@/lib/auth";
import * as XLSX from "xlsx";

// Keywords that indicate the user is asking about CRM/pipeline data
const CRM_KEYWORDS = [
  "merchant", "pipeline", "onboarding", "integrating", "connected",
  "stuck", "paused", "kyc", "aml", "nda", "mif", "sfp", "agreement",
  "vertical", "fx", "betting", "adults", "psp", "pma",
  "stage", "status", "board", "monday", "crm",
  "bolsa", "processor", "rates", "presentation", "call",
  "cuantos", "cuántos", "cuales", "cuáles", "listar", "lista",
  "resumen", "summary", "search", "buscar", "merchants",
];

function needsCrmData(text) {
  const lower = text.toLowerCase();
  return CRM_KEYWORDS.some((kw) => lower.includes(kw));
}

async function handleAuth(chatId, secret) {
  if (!secret) {
    await sendMessage(chatId, "Usage: `/auth your_secret_key`");
    return;
  }

  if (authorize(chatId, secret)) {
    await sendMessage(chatId,
      `✅ *Autorizado!*
Ya tenés acceso a S-Interio Bot.
Escribí /help para ver los comandos disponibles.`
    );
  } else {
    await sendMessage(chatId, "❌ Clave inválida. Acceso denegado.");
  }
}

async function handleStart(chatId) {
  if (!isAuthorized(chatId)) {
    await sendMessage(chatId,
      `🔒 *S-Interio Bot*
━━━━━━━━━━━━━━━
Este bot requiere autenticación.

Usá: \`/auth tu_clave_secreta\`

Contactá al admin para obtener acceso.`
    );
    return;
  }

  await sendMessage(chatId,
    `👋 *Soy S-Interio Bot*
━━━━━━━━━━━━━━━
Soy el asistente inteligente del equipo de S-Interio, potenciado por Claude Sonnet 4.6 con capacidades de razonamiento avanzado y búsqueda web.

*Puedo ayudarte con:*
🔹 Pipeline de merchants y datos del CRM
🔹 Investigación de mercado y competencia
🔹 Análisis de negocio y estrategia
🔹 Redacción de emails, propuestas y reportes
🔹 Cálculos financieros y proyecciones
🔹 Regulaciones y compliance en payments
🔹 Cualquier pregunta general

*Comandos rápidos:*
/summary - Resumen del pipeline
/search \`nombre\` - Buscar un merchant
/stuck - Merchants detenidos
/logout - Cerrar sesión
/help - Todos los comandos

O simplemente *escribime lo que necesites* 💬`
  );
}

async function handleHelp(chatId) {
  await sendMessage(chatId,
    `📖 *Comandos Disponibles*
━━━━━━━━━━━━━━━
/summary - Resumen del pipeline con conteo
/search \`nombre\` - Buscar merchant por nombre
/stuck - Listar merchants detenidos/pausados
/logout - Cerrar sesión
/help - Mostrar esta ayuda

💬 *Lenguaje Natural:*
Escribime cualquier pregunta y la analizo con razonamiento avanzado.

*Ejemplos CRM:*
• _"Status de VPTrade"_
• _"Cuántos merchants hay en integrating?"_
• _"Dame un resumen de los merchants de Betting"_

*Ejemplos Generales:*
• _"Redactame un email para un merchant nuevo"_
• _"Qué regulaciones aplican para payments en Europa?"_
• _"Analiza las tendencias en el mercado de FX"_
• _"Ayudame a calcular las tasas para este merchant"_`
  );
}

async function handleLogout(chatId) {
  deauthorize(chatId);
  await sendMessage(chatId, "🔒 Sesión cerrada. Usá `/auth` para volver a ingresar.");
}

async function handleSummary(chatId) {
  const items = await withTypingIndicator(chatId, () => fetchAllMerchants());
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

  const items = await withTypingIndicator(chatId, () => fetchAllMerchants());
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
  const items = await withTypingIndicator(chatId, () => fetchAllMerchants());

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
  const response = await withTypingIndicator(chatId, async () => {
    let merchantData = null;

    // Only fetch CRM data if the question seems related
    if (needsCrmData(text)) {
      const items = await fetchAllMerchants();
      // Map column IDs to short names to save tokens
      const COL_NAMES = {
        color_mksax617: "vertical", status: "presentation", color_mm0gvm7j: "call",
        color_mksah081: "nda", color_mksa17kf: "mif", color_mksakysh: "rates",
        color_mksahbew: "kyc", color_mkwfzxr4: "sfp", color_mksa9qkk: "agreement",
        color_mksabbma: "integration", color_mm0gj9q8: "extra1", color_mm0nh0ps: "extra2",
        text_mksdt5dn: "contact", text_mksd9sqe: "notes", dropdown_mksd3xc0: "dropdown",
        multiple_person_mksdn607: "assignee",
      };
      merchantData = items.map((item) => {
        const row = { n: item.name, g: item.group.title };
        item.column_values.forEach((c) => {
          if (c.text) row[COL_NAMES[c.id] || c.id] = c.text;
        });
        return row;
      });
    }

    return await askClaude(text, merchantData);
  });

  await sendResponse(chatId, response);
}

async function processFileAttachments(message) {
  const attachments = [];

  // Handle documents (PDF, Excel, CSV)
  if (message.document) {
    const doc = message.document;
    const name = doc.file_name || "file";
    const mime = doc.mime_type || "";
    const buffer = await downloadFile(doc.file_id);
    if (!buffer) return attachments;

    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      attachments.push({ type: "pdf", data: buffer.toString("base64"), name });
    } else if (mime.includes("spreadsheet") || mime.includes("excel") || name.match(/\.xlsx?$/i) || name.endsWith(".csv")) {
      try {
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const sheets = workbook.SheetNames.map((sheetName) => {
          const rows = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          return `Sheet "${sheetName}":\n${rows}`;
        });
        attachments.push({ type: "text", data: sheets.join("\n\n"), name });
      } catch {
        attachments.push({ type: "text", data: "[Error reading Excel file]", name });
      }
    } else if (mime.startsWith("text/") || name.endsWith(".csv") || name.endsWith(".txt")) {
      attachments.push({ type: "text", data: buffer.toString("utf-8"), name });
    }
  }

  // Handle photos
  if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1]; // Largest size
    const buffer = await downloadFile(photo.file_id);
    if (buffer) {
      attachments.push({ type: "image", mediaType: "image/jpeg", data: buffer.toString("base64"), name: "photo.jpg" });
    }
  }

  return attachments;
}

async function sendResponse(chatId, response) {
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

const BOT_USERNAME = "s_interio_bot";

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body.message;

    const hasText = !!message?.text;
    const hasFile = !!(message?.document || message?.photo);

    if (!hasText && !hasFile) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
    const text = (message.text || message.caption || "").trim();

    // Handle file uploads (documents, photos)
    if (hasFile && !text.startsWith("/")) {
      if (!isAuthorized(chatId)) {
        await sendMessage(chatId, "🔒 Necesitás autenticarte primero.\nUsá: `/auth tu_clave_secreta`");
        return NextResponse.json({ ok: true });
      }

      const response = await withTypingIndicator(chatId, async () => {
        const files = await processFileAttachments(message);
        if (files.length === 0) {
          return "No pude procesar ese archivo. Formatos soportados: PDF, Excel (.xlsx/.xls), CSV, imágenes y texto.";
        }
        const prompt = text || "Analiza este archivo y dame un resumen de los puntos clave.";
        return await askClaude(prompt, null, files);
      });

      await sendResponse(chatId, response);
      return NextResponse.json({ ok: true });
    }

    if (!hasText) {
      return NextResponse.json({ ok: true });
    }

    const parts = text.split(" ");
    const command = parts[0].toLowerCase().split("@")[0];
    const commandTarget = parts[0].toLowerCase().includes("@") ? parts[0].toLowerCase().split("@")[1] : null;
    const args = parts.slice(1).join(" ");

    // In groups, only respond to commands directed at us or mentions
    if (isGroup && !text.startsWith("/")) {
      const mentioned = text.toLowerCase().includes(`@${BOT_USERNAME}`) ||
        (message.entities || []).some((e) =>
          e.type === "mention" && text.substring(e.offset, e.offset + e.length).toLowerCase() === `@${BOT_USERNAME}`
        ) ||
        message.reply_to_message?.from?.username === BOT_USERNAME;

      if (!mentioned) {
        return NextResponse.json({ ok: true });
      }

      // Remove the @mention from the text before processing
      const cleanText = text.replace(new RegExp(`@${BOT_USERNAME}`, "gi"), "").trim();
      if (!isAuthorized(chatId)) {
        await sendMessage(chatId, "🔒 Necesitás autenticarte primero.\nUsá: `/auth tu_clave_secreta`");
      } else if (cleanText) {
        await handleNaturalLanguage(chatId, cleanText);
      } else {
        await sendMessage(chatId, "👋 Acá estoy. ¿En qué te puedo ayudar? Escribí tu pregunta mencionándome.");
      }
      return NextResponse.json({ ok: true });
    }

    // In groups, ignore commands targeted at other bots
    if (isGroup && commandTarget && commandTarget !== BOT_USERNAME) {
      return NextResponse.json({ ok: true });
    }

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
        "🔒 Necesitás autenticarte primero.\nUsá: `/auth tu_clave_secreta`"
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
