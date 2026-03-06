import { NextResponse } from "next/server";
import { setWebhook } from "@/lib/telegram";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const host = searchParams.get("host");

  if (!host) {
    return NextResponse.json({ error: "Provide ?host=your-domain.vercel.app" }, { status: 400 });
  }

  const webhookUrl = `https://${host}/api/telegram`;
  const result = await setWebhook(webhookUrl);

  return NextResponse.json({ webhookUrl, result });
}
