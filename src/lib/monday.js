const API_TOKEN = process.env.MONDAY_API_TOKEN;

export async function queryMonday(query) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: API_TOKEN,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

const BOARD_ID = 2025086909;

const COLUMN_IDS = [
  "color_mksax617", "status", "color_mm0gvm7j", "color_mksah081",
  "color_mksa17kf", "color_mksakysh", "color_mksahbew", "color_mkwfzxr4",
  "color_mksa9qkk", "color_mksabbma", "color_mm0gj9q8", "color_mm0nh0ps",
  "text_mksdt5dn", "text_mksd9sqe", "dropdown_mksd3xc0", "multiple_person_mksdn607",
];

const ITEMS_FIELDS = `
  id name
  group { id title }
  column_values(ids: [${COLUMN_IDS.map((c) => `"${c}"`).join(", ")}]) { id text }
`;

// Cache CRM data for 3 minutes to avoid repeated API calls
const CACHE_TTL = 3 * 60 * 1000;
let cachedItems = null;
let cacheTimestamp = 0;

export async function fetchAllMerchants() {
  // Return cached data if still fresh
  if (cachedItems && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedItems;
  }

  let allItems = [];

  const firstRes = await queryMonday(`{
    boards(ids: [${BOARD_ID}]) {
      items_page(limit: 100) {
        cursor
        items { ${ITEMS_FIELDS} }
      }
    }
  }`);

  const page = firstRes.data.boards[0].items_page;
  allItems = page.items;
  let cursor = page.cursor;

  while (cursor) {
    const nextRes = await queryMonday(`{
      next_items_page(limit: 100, cursor: "${cursor}") {
        cursor
        items { ${ITEMS_FIELDS} }
      }
    }`);
    const nextPage = nextRes.data.next_items_page;
    allItems = allItems.concat(nextPage.items);
    cursor = nextPage.cursor;
  }

  cachedItems = allItems;
  cacheTimestamp = Date.now();
  return allItems;
}

export const PIPELINE_STAGES = [
  { id: "status", label: "1. Presentation" },
  { id: "color_mm0gvm7j", label: "1b. Call" },
  { id: "color_mksah081", label: "2. NDA" },
  { id: "color_mksa17kf", label: "3. MIF Form" },
  { id: "color_mksakysh", label: "4. Rates" },
  { id: "color_mksahbew", label: "5. KYC/AML" },
  { id: "color_mkwfzxr4", label: "6. SFP" },
  { id: "color_mksa9qkk", label: "7. Agreement" },
  { id: "color_mksabbma", label: "8. Integration" },
];

export const GROUP_LABELS = {
  group_mkx1bnzx: "Slow Onboarding",
  topics: "Onboarding/Introducing",
  group_mksdq9bg: "Integrating",
  group_mksdwekt: "Connected",
  group_mktca2fg: "Bolsa",
  group_mktry9g7: "Stopped by Processors",
};

const DONE_VALUES = [
  "Sent", "Signed", "Completed", "Approved", "Connected", "Done", "YES",
  "No need", "1. Credentials Sent", "2. Dashboard created", "3. Test Environment",
  "4. Merch testing", "5. Live",
];
const IN_PROGRESS_VALUES = [
  "Working on it", "Discussing", "In process", "Analyzing docs",
  "Waiting", "Waiting for documentation", "Draft sent", "Strategy Planning",
  "Slowed down", "Missing docs",
];
const STUCK_VALUES = ["Stuck", "PAUSED", "Not appproved", "Never/Stopped"];

export function getStageStatus(value) {
  if (!value) return "none";
  if (DONE_VALUES.includes(value)) return "done";
  if (IN_PROGRESS_VALUES.includes(value)) return "in-progress";
  if (STUCK_VALUES.includes(value)) return "stuck";
  return "none";
}

export function getMerchantSummary(items) {
  const groups = {};
  items.forEach((item) => {
    const gid = item.group.id;
    const label = GROUP_LABELS[gid] || item.group.title;
    groups[label] = (groups[label] || 0) + 1;
  });

  const stageStats = PIPELINE_STAGES.map((stage) => {
    let done = 0, inProgress = 0, stuck = 0, empty = 0;
    items.forEach((item) => {
      const col = item.column_values.find((c) => c.id === stage.id);
      const status = getStageStatus(col?.text);
      if (status === "done") done++;
      else if (status === "in-progress") inProgress++;
      else if (status === "stuck") stuck++;
      else empty++;
    });
    return { label: stage.label, done, inProgress, stuck, empty };
  });

  return { total: items.length, groups, stageStats };
}

export function formatMerchantDetail(item) {
  const vertical = item.column_values.find((c) => c.id === "color_mksax617");
  const contact = item.column_values.find((c) => c.id === "text_mksdt5dn");
  const group = GROUP_LABELS[item.group.id] || item.group.title;

  let completed = 0;
  const stages = PIPELINE_STAGES.map((stage) => {
    const col = item.column_values.find((c) => c.id === stage.id);
    const status = getStageStatus(col?.text);
    const icon = status === "done" ? "✅" : status === "in-progress" ? "🔄" : status === "stuck" ? "🔴" : "⬜";
    if (status === "done") completed++;
    return `${icon} ${stage.label}: ${col?.text || "—"}`;
  }).join("\n");

  const progress = Math.round((completed / PIPELINE_STAGES.length) * 100);

  return `📋 *${item.name}*
━━━━━━━━━━━━━━━
📁 Group: ${group}
🏷 Vertical: ${vertical?.text || "N/A"}
👤 Contact: ${contact?.text || "N/A"}
📊 Progress: ${progress}% (${completed}/${PIPELINE_STAGES.length})

${stages}`;
}
