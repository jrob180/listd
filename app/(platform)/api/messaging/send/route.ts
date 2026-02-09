import { NextRequest, NextResponse } from "next/server";
import { processInboundMessage } from "../../../lib/conversation";
import { getSupabase, DRAFT_PHOTOS_BUCKET } from "../../../lib/supabase";

/**
 * In-app native messaging: no Twilio. Accepts sessionId + body + optional image uploads.
 * POST JSON: { sessionId: string, body: string, mediaUrls?: string[] }
 * POST FormData: sessionId, body, and optional file(s)
 */
export async function POST(request: NextRequest) {
  let sessionId: string;
  let body: string;
  let mediaUrls: string[] = [];
  let uploadedMediaUrls: string[] = [];

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    sessionId = (formData.get("sessionId") ?? formData.get("session_id")) as string;
    body = (formData.get("body") ?? formData.get("message") ?? "") as string;
    const files = formData.getAll("files") as File[];
    const fileList = files.length ? files : (formData.getAll("file") as File[]);
    if (!sessionId?.trim()) {
      return NextResponse.json(
        { error: "Missing sessionId" },
        { status: 400 }
      );
    }
    if (fileList.length > 0) {
      uploadedMediaUrls = await uploadAppFiles(fileList, sessionId.trim());
      mediaUrls = uploadedMediaUrls;
    }
  } else {
    const json = await request.json().catch(() => ({}));
    sessionId = json.sessionId ?? json.session_id ?? "";
    body = json.body ?? json.message ?? "";
    mediaUrls = Array.isArray(json.mediaUrls) ? json.mediaUrls : [];
    if (!sessionId?.trim()) {
      return NextResponse.json(
        { error: "Missing sessionId" },
        { status: 400 }
      );
    }
  }

  const from = `app:${sessionId.trim()}`;

  try {
    const { message, choices } = await processInboundMessage({
      from,
      body: body ?? "",
      mediaUrls,
    });
    return NextResponse.json({
      message: message ?? "",
      uploadedMediaUrls,
      ...(Array.isArray(choices) && choices.length > 0 ? { choices } : {}),
    });
  } catch (e) {
    console.error("[messaging/send] Error:", e);
    return NextResponse.json(
      { error: "Failed to process message", message: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

async function uploadAppFiles(files: File[], sessionId: string): Promise<string[]> {
  const supabase = getSupabase();
  const urls: string[] = [];
  for (const file of files) {
    if (!file?.type?.startsWith("image/")) continue;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `app-drafts/${sessionId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await supabase.storage
      .from(DRAFT_PHOTOS_BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });
    if (error) continue;
    const { data } = supabase.storage.from(DRAFT_PHOTOS_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}
