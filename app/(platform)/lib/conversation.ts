import { getSupabase, type SmsConversation } from "./supabase";

export function normalizeBody(body: string): string {
  return body?.trim() ?? "";
}

export type ProcessInput = {
  from: string;
  body: string;
  mediaUrls: string[];
};

export type ProcessResult = {
  message: string;
};

// Structured fields the LLM can extract. Photos are server-managed.
export type ListingState = {
  itemTitle?: string;
  categoryPath?: string;
  brand?: string;
  model?: string;
  size?: string;
  color?: string;
  condition?: string;
  conditionDetails?: string;
  defects?: string[];
  [key: string]: unknown;
};

type Stage =
  | "awaiting_item"
  | "awaiting_photos"
  | "awaiting_condition"
  | "finalize"
  | "complete";

const STAGES: Stage[] = [
  "awaiting_item",
  "awaiting_photos",
  "awaiting_condition",
  "finalize",
  "complete",
];

function isStage(s: string): s is Stage {
  return STAGES.includes(s as Stage);
}

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return (v as unknown[])
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean) as string[];
  }
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return (parsed as unknown[])
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean) as string[];
      }
    } catch {
      // ignore
    }
    if (v.startsWith("{") && v.endsWith("}")) {
      return v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/** Merge patch into state. Only overwrite when patch has a defined value. Never delete. */
function mergePatch(
  state: ListingState,
  patch: Partial<ListingState> | null | undefined
): ListingState {
  if (!patch || typeof patch !== "object") return state;
  const out = { ...state };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

async function fetchTwilioImageAsDataUrl(url: string): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${accountSid}:${authToken}`
        ).toString("base64")}`,
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

const EXTRACTION_SYSTEM = `You are an extraction engine. Do not ask questions. Do not converse. Only extract structured fields you are confident about from the user's message and/or the attached images.

Output ONLY valid JSON in this exact shape (no other text):
{ "listing_state_patch": { ... } }

listing_state_patch may contain any of: itemTitle, categoryPath, brand, model, size, color, condition, conditionDetails, defects (array of strings). Only include fields you are confident about. If unsure, omit the field.`;

type ExtractionOutput = { listing_state_patch?: Partial<ListingState> };

async function extractFromUser(
  userMessage: string,
  currentState: ListingState,
  imageDataUrls: string[]
): Promise<Partial<ListingState>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};

  const userPayload = {
    latest_user_message: userMessage,
    current_listing_state: currentState,
  };

  const content: unknown[] =
    imageDataUrls.length === 0
      ? [JSON.stringify(userPayload)]
      : [
          { type: "text" as const, text: JSON.stringify(userPayload) },
          ...imageDataUrls.slice(0, 2).map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ];

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return {};
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return {};
    const parsed = JSON.parse(raw) as ExtractionOutput;
    return parsed?.listing_state_patch ?? {};
  } catch {
    return {};
  }
}

function userConfirmed(body: string): boolean {
  return /^(yes|yeah|yep|sure|please|ok|okay|y|sounds good|do it)$/i.test(
    normalizeBody(body)
  );
}

function hasSufficientDescription(
  state: ListingState,
  lastBody: string
): boolean {
  return (
    !!state.itemTitle &&
    (normalizeBody(lastBody).length >= 15 ||
      !!state.conditionDetails ||
      !!state.brand)
  );
}

export async function processInboundMessage(
  input: ProcessInput
): Promise<ProcessResult> {
  const { from, body, mediaUrls } = input;
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("phone_number", from)
    .single();

  const row = (existing as SmsConversation | null) ?? null;
  const currentPhotos = coerceStringArray(row?.photo_urls as unknown);
  const mergedPhotos = [...currentPhotos, ...mediaUrls].filter(Boolean);
  let listingState: ListingState =
    (row?.listing_state as ListingState | null) ?? {};
  let stage: Stage = isStage(row?.stage ?? "")
    ? (row!.stage as Stage)
    : "awaiting_item";

  // Log inbound
  await supabase.from("sms_messages").insert({
    phone_number: from,
    direction: "in",
    body,
    media_urls: mediaUrls,
  });

  const now = new Date().toISOString();

  // New conversation: create row and ask first question
  if (!row) {
    await supabase.from("sms_conversations").upsert(
      {
        phone_number: from,
        stage: "awaiting_item",
        item_name: null,
        condition: null,
        photo_urls: mergedPhotos,
        listing_state: {},
        updated_at: now,
      },
      { onConflict: "phone_number" }
    );
    const reply = "What are you selling?";
    await supabase.from("sms_messages").insert({
      phone_number: from,
      direction: "out",
      body: reply,
      media_urls: [],
    });
    return { message: reply };
  }

  // Extract from user input when there is something to extract
  const hasInput = normalizeBody(body).length > 0 || mediaUrls.length > 0;
  if (hasInput) {
    const imageUrls = await Promise.all(
      mediaUrls.slice(0, 2).map((u) => fetchTwilioImageAsDataUrl(u))
    );
    const dataUrls = imageUrls.filter((u): u is string => !!u);
    const patch = await extractFromUser(body, listingState, dataUrls);
    listingState = mergePatch(listingState, patch);
  }
  // Server owns photos
  listingState.photos = mergedPhotos;

  // Advance stage when conditions are met
  if (stage === "awaiting_item" && listingState.itemTitle) {
    stage = "awaiting_photos";
  }
  if (
    stage === "awaiting_photos" &&
    (mergedPhotos.length > 0 || hasSufficientDescription(listingState, body))
  ) {
    stage = "awaiting_condition";
  }
  if (stage === "awaiting_condition" && listingState.condition) {
    stage = "finalize";
  }
  if (stage === "finalize" && userConfirmed(body)) {
    stage = "complete";
  }

  // One question per turn — chosen by server only
  let reply: string;
  if (stage === "complete") {
    reply = "You're all set. We'll be in touch.";
  } else if (stage === "awaiting_item") {
    reply = "What are you selling?";
  } else if (stage === "awaiting_photos") {
    reply =
      "Can you send 1–3 photos? If not, describe the item briefly.";
  } else if (stage === "awaiting_condition") {
    reply = "What condition is it in? (like new / good / fair)";
  } else {
    reply = "Got it — want me to list this for you?";
  }

  await supabase.from("sms_messages").insert({
    phone_number: from,
    direction: "out",
    body: reply,
    media_urls: [],
  });

  await supabase.from("sms_conversations").upsert(
    {
      phone_number: from,
      stage,
      item_name: listingState.itemTitle ?? null,
      condition: listingState.condition ?? null,
      photo_urls: mergedPhotos,
      listing_state: listingState,
      updated_at: now,
    },
    { onConflict: "phone_number" }
  );

  return { message: reply };
}
