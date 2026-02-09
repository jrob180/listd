import { NextRequest, NextResponse } from "next/server";
import { processInboundMessage } from "../../../lib/conversation";

function parseInboundForm(request: NextRequest): Promise<{
  From: string;
  Body: string;
  MediaUrl0?: string;
  [key: string]: string | undefined;
}> {
  return request.text().then((text) => {
    const params = new URLSearchParams(text);
    const out: Record<string, string | undefined> = {};
    params.forEach((v, k) => {
      out[k] = v;
    });
    return out as {
      From: string;
      Body: string;
      MediaUrl0?: string;
      [key: string]: string | undefined;
    };
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

export async function POST(request: NextRequest) {
  const params = await parseInboundForm(request);
  const from = params.From;
  const body = params.Body ?? "";
  const mediaUrls = getMediaUrls(params);

  if (!from) {
    return NextResponse.json({ error: "Missing From" }, { status: 400 });
  }

  const { message } = await processInboundMessage({
    from,
    body,
    mediaUrls,
  });

  return twiml(message);
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
