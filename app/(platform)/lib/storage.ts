import { getSupabase, DRAFT_PHOTOS_BUCKET } from "./supabase";

const TWILIO_AUTH =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? `Basic ${Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString("base64")}`
    : null;

/**
 * Download from Twilio media URL and upload to Supabase Storage.
 * Returns public storage URL or null on failure.
 */
export async function downloadTwilioAndStore(
  twilioMediaUrl: string,
  draftId: string,
  kind: "user" | "reference" = "user"
): Promise<{ storageUrl: string; path: string } | null> {
  if (!TWILIO_AUTH) return null;
  const supabase = getSupabase();
  try {
    const res = await fetch(twilioMediaUrl, { headers: { Authorization: TWILIO_AUTH } });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `${draftId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(DRAFT_PHOTOS_BUCKET)
      .upload(path, buffer, {
        contentType: contentType.split(";")[0].trim(),
        upsert: false,
      });
    if (error) return null;

    const { data: urlData } = supabase.storage
      .from(DRAFT_PHOTOS_BUCKET)
      .getPublicUrl(path);
    const storageUrl = urlData.publicUrl;

    const { error: insertErr } = await supabase.from("draft_photos").insert({
      draft_id: draftId,
      kind,
      storage_url: storageUrl,
    });
    if (insertErr) return null;

    return { storageUrl, path };
  } catch {
    return null;
  }
}

/**
 * Store multiple Twilio media URLs for a draft. Returns storage URLs in same order (null for failures).
 */
export async function storeInboundMedia(
  twilioUrls: string[],
  draftId: string
): Promise<string[]> {
  const out: string[] = [];
  for (const url of twilioUrls) {
    const r = await downloadTwilioAndStore(url, draftId, "user");
    out.push(r?.storageUrl ?? "");
  }
  return out.filter(Boolean);
}

/**
 * Register already-uploaded storage URLs (e.g. from app channel) in draft_photos. No download.
 */
export async function registerStorageUrls(
  storageUrls: string[],
  draftId: string
): Promise<string[]> {
  const supabase = getSupabase();
  const out: string[] = [];
  for (const url of storageUrls) {
    if (!url?.trim()) continue;
    const { error } = await supabase.from("draft_photos").insert({
      draft_id: draftId,
      kind: "user",
      storage_url: url.trim(),
    });
    if (!error) out.push(url.trim());
  }
  return out;
}
