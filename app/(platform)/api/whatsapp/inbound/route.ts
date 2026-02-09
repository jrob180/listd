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

  // Debug: see these in Vercel → Project → Logs (filter by /api/whatsapp/inbound)
  console.log("[whatsapp/inbound] REQUEST", {
    From: rawFrom,
    Body: body,
    bodyLength: body.length,
    paramKeys: Object.keys(params),
    hasBodyKey: "Body" in params,
  });

  if (!rawFrom) {
    return NextResponse.json({ error: "Missing From" }, { status: 400 });
  }

  const from = normalizeFrom(rawFrom);

  // Quick test (no DB): send "ping" to confirm webhook is reached
  if (body.trim().toLowerCase() === "ping") {
    const res = twiml("pong");
    console.log("[whatsapp/inbound] RESPONSE (ping)", { reply: "pong", contentType: res.headers.get("Content-Type"), bodyLength: res.headers.get("Content-Length") ?? "(stream)" });
    return res;
  }

  // Trigger: reply immediately so Twilio gets 200 before any DB/processing (avoids timeout + no-response)
  const norm = body.trim().toLowerCase().replace(/\s+/g, " ").trim();
  const isTrigger =
    norm === "i want to sell something" ||
    (norm.includes("want") && norm.includes("sell"));
  if (isTrigger) {
    const reply = "Send at least one photo of the item to get started.";
    void processInboundMessage({ from, body, mediaUrls }).catch((e) =>
      console.error("[whatsapp/inbound] Trigger background:", e)
    );
    return twiml(reply);
  }

  try {
    const { message } = await processInboundMessage({
      from,
      body,
      mediaUrls,
    });
    return twiml(message ?? "Something went wrong. Please try again.");
  } catch (e) {
    console.error("[whatsapp/inbound] Error processing message:", e);
    return twiml("Something went wrong on our end. Please try again in a moment.");
  }
}

function twiml(message: string): NextResponse {
  const body = escapeXml(message);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${body}</Body></Message></Response>`;
  console.log("[whatsapp/inbound] TWIML", { message: message.slice(0, 80), xmlLength: xml.length, xmlPreview: xml.slice(0, 120) + "..." });
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
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
