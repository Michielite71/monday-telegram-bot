import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are S-Interio's CRM assistant bot. You help the team manage their merchant pipeline on Monday.com.

You will receive the current state of the MERCHANTS board as context, and the user's question. Analyze the data and respond helpfully.

Key concepts:
- Merchants go through a pipeline: Presentation → Call → NDA → MIF Form → Rates → KYC/AML → SFP → Agreement → Integration
- Groups: Onboarding/Introducing, Slow Onboarding, Integrating, Connected, Bolsa, Stopped by Processors
- Verticals: FX, Betting, Adults, Digital Bank, PSP, PMA, etc.
- Stage statuses: Done (green), In Progress (orange), Stuck (red), Empty (not started)

Response rules:
- Always respond in the same language the user writes in (Spanish or English)
- Keep responses concise and actionable
- Use emojis sparingly for readability
- Format with Markdown (bold, lists) for Telegram
- When listing merchants, show max 10 unless asked for more
- Include percentages and counts when analyzing data
- You have access to web search - use it when the user asks about things outside the CRM data (industry info, regulations, company research, etc.)
- When you search the web, cite your sources briefly`;

export async function askClaude(userMessage, merchantData) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      },
    ],
    messages: [
      {
        role: "user",
        content: `Here is the current merchant pipeline data (JSON):

\`\`\`json
${JSON.stringify(merchantData, null, 0)}
\`\`\`

User question: ${userMessage}`,
      },
    ],
  });

  const textBlocks = response.content.filter((block) => block.type === "text");
  return textBlocks.map((block) => block.text).join("\n\n");
}
