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

// Server-owned state. LLM only provides inferredItem / inferredCondition.
export type ListingState = {
  inferredItem?: string; // e.g. "modern arc floor lamp"
  inferredCondition?: string; // e.g. "used – like new"
  itemTitle?: string; // final after user confirms/corrects
  condition?: string; // final after user confirms/corrects
  itemConfirmed?: boolean;
  conditionConfirmed?: boolean;
  [key: string]: unknown;
};

type Stage =
  | "awaiting_intake"
  | "item_confirm"
  | "condition_confirm"
  | "final_confirm"
  | "complete";

const ENTRY_MESSAGE =
  "Great — send a photo of the item. If you can't, just describe it.";

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

const INFERENCE_SYSTEM = `You are an inference engine. Look at the user's photos and/or text and infer:
1. A short, human item description (e.g. "modern arc floor lamp", "vintage denim jacket") — one clear phrase for "This looks like a [X]. Is that right?"
2. A listing condition phrase (e.g. "used – like new", "used – good") for "I'd list this as '[X]'. Does that sound right?"

Output ONLY valid JSON:
{ "inferredItem": "...", "inferredCondition": "..." }

Be concise. No questions. No extra text.`;

type InferenceOutput = {
  inferredItem?: string;
  inferredCondition?: string;
};

async function runInference(
  userMessage: string,
  imageDataUrls: string[]
): Promise<InferenceOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};

  const payload = {
    user_message: userMessage,
    has_images: imageDataUrls.length > 0,
  };

  const content: unknown[] =
    imageDataUrls.length === 0
      ? [JSON.stringify(payload)]
      : [
          { type: "text" as const, text: JSON.stringify(payload) },
          ...imageDataUrls.slice(0, 3).map((url) => ({
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
          { role: "system", content: INFERENCE_SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return {};
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return {};
    return (JSON.parse(raw) as InferenceOutput) ?? {};
  } catch {
    return {};
  }
}

function isTrigger(body: string): boolean {
  if (!body || typeof body !== "string") return false;
  const n = normalizeBody(body)
    .toLowerCase()
    .replace(/[\s]+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
  return (
    n === "i want to sell something" ||
    (n.includes("want") && n.includes("sell"))
  );
}

function isYes(body: string): boolean {
  return /^(yes|yeah|yep|sure|y|correct|right|that\'?s right|sounds good)$/i.test(
    normalizeBody(body)
  );
}

function isNotYet(body: string): boolean {
  return /^(no|not yet|wait|hold on|later)$/i.test(normalizeBody(body));
}

export async function processInboundMessage(
  input: ProcessInput
): Promise<ProcessResult> {
  const { from, body, mediaUrls } = input;

  // —— 0. Entry: respond immediately so Twilio always gets a reply ——
  if (isTrigger(body)) {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    try {
      await supabase.from("sms_messages").insert({
        phone_number: from,
        direction: "in",
        body,
        media_urls: mediaUrls,
      });
    } catch (_) {
      // don't block reply if logging fails
    }
    try {
      await supabase.from("sms_conversations").upsert(
        {
          phone_number: from,
          stage: "awaiting_intake",
          item_name: null,
          condition: null,
          photo_urls: [],
          listing_state: {} as ListingState,
          updated_at: now,
        },
        { onConflict: "phone_number" }
      );
      await supabase.from("sms_messages").insert({
        phone_number: from,
        direction: "out",
        body: ENTRY_MESSAGE,
        media_urls: [],
      });
    } catch (_) {
      // still reply even if DB fails
    }
    return { message: ENTRY_MESSAGE };
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("phone_number", from)
    .single();

  const row = (existing as SmsConversation | null) ?? null;
  const currentPhotos = coerceStringArray(row?.photo_urls as unknown);
  const mergedPhotos = [...currentPhotos, ...mediaUrls].filter(Boolean);
  const listingState: ListingState =
    (row?.listing_state as ListingState | null) ?? {};
  const stage: Stage = (row?.stage as Stage) || "awaiting_intake";
  const normBody = normalizeBody(body);

  try {
    await supabase.from("sms_messages").insert({
      phone_number: from,
      direction: "in",
      body,
      media_urls: mediaUrls,
    });
  } catch (_) {
    // don't block reply
  }

  // New conversation without trigger: still start at entry
  if (!row) {
    try {
      await supabase.from("sms_conversations").upsert(
        {
          phone_number: from,
          stage: "awaiting_intake",
          item_name: null,
          condition: null,
          photo_urls: mergedPhotos,
          listing_state: {} as ListingState,
          updated_at: now,
        },
        { onConflict: "phone_number" }
      );
      await supabase.from("sms_messages").insert({
        phone_number: from,
        direction: "out",
        body: ENTRY_MESSAGE,
        media_urls: [],
      });
    } catch (_) {}
    return { message: ENTRY_MESSAGE };
  }

  let reply: string;
  let nextStage: Stage = stage;
  const nextState: ListingState = { ...listingState };
  nextState.photos = mergedPhotos;

  switch (stage) {
    // —— 1. Intake → 2. Inference → 3. Item confirmation ——
    case "awaiting_intake": {
      const hasContent = mergedPhotos.length > 0 || normBody.length >= 2;
      if (!hasContent) {
        reply = ENTRY_MESSAGE;
        break;
      }
      const imageUrls = await Promise.all(
        mediaUrls.slice(0, 3).map((u) => fetchTwilioImageAsDataUrl(u))
      );
      const dataUrls = imageUrls.filter((u): u is string => !!u);
      const out = await runInference(body, dataUrls);
      nextState.inferredItem =
        out.inferredItem?.trim() || "item";
      nextState.inferredCondition =
        out.inferredCondition?.trim() || "used – good";
      nextState.itemTitle = nextState.inferredItem;
      nextState.condition = nextState.inferredCondition;
      reply = `This looks like a ${nextState.inferredItem}. Is that right?`;
      nextStage = "item_confirm";
      break;
    }

    // —— 4. User response to item → 5. Condition confirmation ——
    case "item_confirm": {
      if (isYes(body)) {
        nextState.itemConfirmed = true;
        nextState.itemTitle = nextState.itemTitle || nextState.inferredItem;
      } else if (normBody.length >= 2 && !/^(no|nope|not sure|idk)$/i.test(normBody)) {
        nextState.itemTitle = body.trim();
        nextState.itemConfirmed = true;
      } else {
        // "not sure" or similar: keep generic, still move on
        nextState.itemTitle = nextState.inferredItem || "item";
        nextState.itemConfirmed = true;
      }
      reply = `I'd list this as '${nextState.condition || nextState.inferredCondition || "used – good"}'. Does that sound right?`;
      nextStage = "condition_confirm";
      break;
    }

    // —— 5. User response to condition → 6. Final confirmation ——
    case "condition_confirm": {
      if (isYes(body)) {
        nextState.conditionConfirmed = true;
        nextState.condition =
          nextState.condition || nextState.inferredCondition;
      } else if (normBody.length >= 2) {
        nextState.condition = body.trim();
        nextState.conditionConfirmed = true;
      } else {
        nextState.conditionConfirmed = true;
      }
      reply =
        "Got it. Want me to list this and handle the rest for you?";
      nextStage = "final_confirm";
      break;
    }

    // —— 6. User says yes / not yet ——
    case "final_confirm": {
      if (isYes(body)) {
        reply = "You're all set. We'll be in touch.";
        nextStage = "complete";
      } else if (isNotYet(body)) {
        reply = "No problem — just say when you're ready.";
      } else {
        reply =
          "Got it. Want me to list this and handle the rest for you?";
      }
      break;
    }

    case "complete":
    default:
      reply = "You're all set. We'll be in touch.";
      break;
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
      stage: nextStage,
      item_name: nextState.itemTitle ?? null,
      condition: nextState.condition ?? null,
      photo_urls: mergedPhotos,
      listing_state: nextState,
      updated_at: now,
    },
    { onConflict: "phone_number" }
  );

  return { message: reply };
}
