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

type ListingState = {
  itemTitle?: string;
  categoryPath?: string;
  brand?: string;
  model?: string;
  size?: string;
  color?: string;
  condition?: string;
  conditionDetails?: string;
  includedAccessories?: string[];
  missingAccessories?: string[];
  defects?: string[];
  photos?: string[];
  estimatedPrice?: {
    currency: string;
    amount: number;
    reasoning: string;
  };
  comparableListings?: {
    title: string;
    url?: string;
    price: { currency: string; amount: number };
    notes?: string;
  }[];
  shipping?: {
    weightKg?: number;
    dimensionsCm?: { length: number; width: number; height: number };
    notes?: string;
  };
  marketplaceSummary?: {
    ebay?: {
      title: string;
      subtitle?: string;
      descriptionHtml: string;
      itemSpecifics: Record<string, string>;
    };
  };
  // Short rolling summary of the conversation so far (last few turns).
  conversationNotes?: string;
  // Whether we've already explicitly asked this user for photos at least once.
  photoRequested?: boolean;
  isComplete?: boolean;
};

type ModelResponse = {
  reply_text: string;
  listing_state: ListingState;
};

const OPENAI_MODEL = "gpt-4o-mini";

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return (v as unknown[])
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean) as string[];
  }
  if (typeof v === "string") {
    // Try JSON first
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return (parsed as unknown[])
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean) as string[];
      }
    } catch {
      // fall through
    }
    // Handle Postgres array literal: {a,b,c}
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

function nonEmptyString(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mergeListingState(
  previous: ListingState,
  next: ListingState,
  photos: string[],
  lastUserMessage: string,
  lastAssistantMessage: string
): ListingState {
  const merged: ListingState = {
    ...previous,
  };

  const take = <T>(
    prev: T | undefined,
    incoming: T | undefined
  ): T | undefined =>
    incoming !== undefined && incoming !== null ? incoming : prev;

  merged.itemTitle = nonEmptyString(
    (next.itemTitle as string | undefined) ??
      (merged.itemTitle as string | undefined)
  );
  merged.categoryPath = nonEmptyString(
    (next.categoryPath as string | undefined) ??
      (merged.categoryPath as string | undefined)
  );
  merged.brand = nonEmptyString(
    (next.brand as string | undefined) ?? (merged.brand as string | undefined)
  );
  merged.model = nonEmptyString(
    (next.model as string | undefined) ?? (merged.model as string | undefined)
  );
  merged.size = nonEmptyString(
    (next.size as string | undefined) ?? (merged.size as string | undefined)
  );
  merged.color = nonEmptyString(
    (next.color as string | undefined) ?? (merged.color as string | undefined)
  );

  merged.condition = nonEmptyString(
    (next.condition as string | undefined) ??
      (merged.condition as string | undefined)
  );
  merged.conditionDetails = nonEmptyString(
    (next.conditionDetails as string | undefined) ??
      (merged.conditionDetails as string | undefined)
  );

  merged.includedAccessories = take(
    previous.includedAccessories,
    next.includedAccessories && next.includedAccessories.length > 0
      ? next.includedAccessories
      : undefined
  );
  merged.missingAccessories = take(
    previous.missingAccessories,
    next.missingAccessories && next.missingAccessories.length > 0
      ? next.missingAccessories
      : undefined
  );
  merged.defects = take(
    previous.defects,
    next.defects && next.defects.length > 0 ? next.defects : undefined
  );

  merged.estimatedPrice = take(previous.estimatedPrice, next.estimatedPrice);
  merged.comparableListings = take(
    previous.comparableListings,
    next.comparableListings && next.comparableListings.length > 0
      ? next.comparableListings
      : undefined
  );

  merged.shipping = take(previous.shipping, next.shipping);
  merged.marketplaceSummary = take(
    previous.marketplaceSummary,
    next.marketplaceSummary
  );

  merged.isComplete = take(previous.isComplete, next.isComplete);

  // Photos are authoritative from the server-side merge.
  merged.photos = photos;

  const prevNotes = previous.conversationNotes ?? "";
  const addition =
    (lastUserMessage ? `User: ${lastUserMessage}\n` : "") +
    (lastAssistantMessage ? `Assistant: ${lastAssistantMessage}` : "");
  const combined = (prevNotes + "\n" + addition).trim();
  // Keep only the last ~1000 characters to avoid unbounded growth.
  merged.conversationNotes =
    combined.length > 1000 ? combined.slice(combined.length - 1000) : combined;

  merged.photoRequested =
    previous.photoRequested || next.photoRequested || photos.length > 0;

  return merged;
}

export async function processInboundMessage(
  input: ProcessInput
): Promise<ProcessResult> {
  const { from, body, mediaUrls } = input;
  const supabase = getSupabase();

  // Load or create conversation row
  const { data: existing } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("phone_number", from)
    .single();

  const row = (existing as SmsConversation | null) ?? null;

  const currentPhotos = coerceStringArray(row?.photo_urls as unknown);
  const mergedPhotos = [...currentPhotos, ...mediaUrls].filter(Boolean);

  const previousListingState: ListingState =
    (row?.listing_state as ListingState | null) ?? {};

  const normalizedBody = normalizeBody(body);
  const hasUsableText = normalizedBody.length >= 10;
  const hasAnyPhotos = mergedPhotos.length > 0;
  const isFirstTurn = !row;

  // Deterministic first-step behavior: only on very first inbound message,
  // and only when we truly have nothing yet.
  if (!hasAnyPhotos && !hasUsableText && isFirstTurn) {
    const listingState: ListingState = {
      ...previousListingState,
      photos: mergedPhotos,
      photoRequested: true,
    };

    const now = new Date().toISOString();
    await supabase.from("sms_conversations").upsert(
      {
        phone_number: from,
        stage: "in_progress",
        item_name: listingState.itemTitle ?? null,
        condition: listingState.condition ?? null,
        photo_urls: mergedPhotos,
        listing_state: listingState,
        updated_at: now,
      },
      { onConflict: "phone_number" }
    );

    return {
      message:
        "Great. Send a few photos of the item or a quick description, and I’ll start drafting the listing.",
    };
  }

  const systemPrompt = `
You are a listing assistant helping a human sell a single item on marketplaces like eBay, Facebook Marketplace, and similar sites.

Your goals:
- Collect the **minimum** information from the user while still creating a **beautiful, accurate, high-conversion listing**.
- Do as much work as possible yourself: infer details from previous messages, and fill in reasonable defaults.
- Be explicit about any guesses or assumptions in the structured state, but avoid overwhelming the user with questions.

Information you should aim to capture in \`listing_state\`:
- Core identity:
  - itemTitle (clear, compelling, eBay-style)
  - brand, model, categoryPath (e.g. "Home & Garden > Lighting > Floor Lamps")
  - size, color, style if relevant
- Condition:
  - condition (e.g. "New", "Used – like new", "Used – good", etc.)
  - conditionDetails (short human description, including wear/tear)
- Contents:
  - includedAccessories (things included: box, charger, cables, etc.)
  - missingAccessories (things typically included but missing, if any)
  - defects (visible damage, marks, issues)
- Photos:
  - photos: array of URLs (we pass them in metadata; you can't see the pixels, but you know how many there are)
- Marketplace-ready output:
  - marketplaceSummary.ebay:
    - title: final eBay-ready title (max ~80 chars, important keywords first)
    - subtitle: optional short extra hook
    - descriptionHtml: rich but concise HTML description (paragraphs + bullet lists)
    - itemSpecifics: key–value map of structured attributes (Brand, Model, Size, Color, Style, Type, Condition, etc.)

Conversation behavior:
- If you don't have any photos yet, you may ask the user to send **one or more photos _or_ a quick description** of the item.
- If the user clearly prefers not to send photos (or keeps replying with text only), **do not keep repeating the same photo request**. Continue the flow using whatever information you have.
- When you have at least one photo URL, infer what you reasonably can (item type, style, etc.) from context and user text; don't ask for every detail if you can reasonably guess or leave it unspecified.
- If the user corrects you (e.g. "it's a lamp, not sneakers"), **immediately trust the correction**, update listing_state, and do not repeat the same mistake.
- Prefer to **infer** details (brand, condition, defects) from context and previous answers; if you are unsure, pick a **reasonable default** and mark it clearly in \`listing_state\` rather than asking the user for everything.
- In each reply, ask **at most one short follow-up question**. If you need multiple details, pick the single most important next question.
- When you feel the listing is good enough to post (title, description, price range, key specifics), set \`listing_state.isComplete = true\` and shift your replies toward confirming the final listing instead of gathering more data.

Important:
- The user interacts over WhatsApp/SMS one message at a time.
- Your reply must be short, friendly, and conversational (1–3 short sentences, plus a simple question when needed).
- Do **not** mention that you are calling any APIs, or talk about JSON or schemas in the message to the user.
- Never ask for information we clearly already know from previous messages unless you need clarification.

Output format:
- Respond **ONLY** with strict JSON that matches this TypeScript type (no backticks, no comments, no extra text):
  {
    "reply_text": string;
    "listing_state": ListingState;
  }

Where ListingState is the structure described above.
`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      message:
        "We’re not fully set up yet. Please try again later while we connect our listing assistant.",
    };
  }

  let modelReply: ModelResponse;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              user_message: body,
              previous_listing_state: previousListingState,
              all_photo_urls: mergedPhotos,
              conversation_notes: previousListingState.conversationNotes ?? "",
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error(
        "[conversation] OpenAI error status",
        response.status,
        await response.text()
      );
      throw new Error(`OpenAI error ${response.status}`);
    }

    const json = await response.json();
    const rawContent =
      json.choices?.[0]?.message?.content ??
      '{"reply_text":"Sorry, I had trouble understanding that. Please try again.","listing_state":{}}';

    modelReply = JSON.parse(rawContent) as ModelResponse;
  } catch (err) {
    console.error("[conversation] Failed to talk to OpenAI:", err);
    return {
      message:
        "Something went wrong on our side while drafting your listing. Please try again in a moment.",
    };
  }

  // Enforce at most one question in the reply.
  let reply = modelReply.reply_text || "";
  const questionMarks = (reply.match(/\?/g) || []).length;
  if (questionMarks > 1) {
    const firstIdx = reply.indexOf("?");
    if (firstIdx !== -1) {
      reply = reply.slice(0, firstIdx + 1).trim();
    }
  }
  modelReply.reply_text = reply;

  const listingState: ListingState = mergeListingState(
    previousListingState,
    modelReply.listing_state ?? {},
    mergedPhotos,
    body,
    reply
  );

  // Upsert conversation row with updated structured state
  const now = new Date().toISOString();
  await supabase.from("sms_conversations").upsert(
    {
      phone_number: from,
      stage: listingState.isComplete ? "complete" : "in_progress",
      item_name: listingState.itemTitle ?? row?.item_name ?? null,
      condition: listingState.condition ?? row?.condition ?? null,
      photo_urls: mergedPhotos,
      listing_state: listingState,
      updated_at: now,
    },
    { onConflict: "phone_number" }
  );

  return {
    message: reply,
  };
}

