import { NextRequest, NextResponse } from "next/server";
import { processInboundMessage } from "../../../lib/conversation";

/**
 * Twilio WhatsApp webhook. Twilio sends the same style form POST as SMS;
 * From is "whatsapp:+44..." so we normalize to E.164 for storage.
 *
 * In Twilio Console: Messaging > Try it out > Send a WhatsApp message >
 * set "When a message comes in" to: https://your-domain.com/api/whatsapp/inbound
 */

function parseInboundForm(request: NextRequest): Promise<{
  From: string;
  Body: string;
  [key: string]: string | undefined;
}> {
  return request.text().then((text) => {
    const params = new URLSearchParams(text);
    const out: Record<string, string | undefined> = {};
    params.forEach((v, k) => {
      out[k] = v;
    });
    return out as { From: string; Body: string; [key: string]: string | undefined };
  });
}

function getMediaUrls(params: Record<string, string | undefined>): string[] {
  const urls: string[] = [];
  let i = 0;
  while (params[`MediaUrl${i}`]) {
    urls.push(params[`MediaUrl${i}`]!);
    i++;
  }
  return urls;
}

/** Normalize Twilio WhatsApp From "whatsapp:+447123456789" to E.164 "+447123456789" */
function normalizeFrom(from: string): string {
  const prefix = "whatsapp:";
  if (from.toLowerCase().startsWith(prefix)) {
    return from.slice(prefix.length);
  }
  return from;
}

export async function POST(request: NextRequest) {
  let params: { From?: string; Body?: string; [key: string]: string | undefined };
  try {
    params = await parseInboundForm(request);
  } catch (e) {
    console.error("[whatsapp/inbound] Failed to parse body:", e);
    return twiml("Something went wrong. Please try again in a moment.");
  }

  const rawFrom = params.From;
  const body = params.Body ?? "";
  const mediaUrls = getMediaUrls(params);

  if (!rawFrom) {
    return NextResponse.json({ error: "Missing From" }, { status: 400 });
  }

  const from = normalizeFrom(rawFrom);

  try {
    const { message } = await processInboundMessage({
      from,
      body,
      mediaUrls,
    });
    return twiml(message);
  } catch (e) {
    console.error("[whatsapp/inbound] Error processing message:", e);
    return twiml("Something went wrong on our end. Please try again in a moment.");
  }
}

function twiml(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return new NextResponse(xml, {
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
