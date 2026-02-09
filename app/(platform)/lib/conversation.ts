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
  // Short rolling summary of the conversation so far (last few turns).
  conversationNotes?: string;
  // Whether we've already explicitly asked this user for photos at least once.
  photoRequested?: boolean;
  marketplaceSummary?: {
    ebay?: {
      title: string;
      subtitle?: string;
      descriptionHtml: string;
      itemSpecifics: Record<string, string>;
    };
  };
  isComplete?: boolean;
};

type ModelResponse = {
  reply_text: string;
  listing_state: ListingState;
};

const OPENAI_MODEL = "gpt-4o-mini";

async function fetchTwilioImageAsDataUrl(
  url: string
): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${accountSid}:${authToken}`
        ).toString("base64")}`,
      },
    });

    if (!res.ok) {
      console.error(
        "[conversation] Failed to fetch Twilio media",
        res.status,
        await res.text()
      );
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    const base64 = buffer.toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    console.error("[conversation] Error fetching Twilio media:", e);
    return null;
  }
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

  const take = <T>(prev: T | undefined, incoming: T | undefined): T | undefined =>
    incoming !== undefined && incoming !== null ? incoming : prev;

  merged.itemTitle = nonEmptyString(
    (next.itemTitle as string | undefined) ?? (merged.itemTitle as string | undefined)
  );
  merged.categoryPath = nonEmptyString(
    (next.categoryPath as string | undefined) ?? (merged.categoryPath as string | undefined)
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
    (next.condition as string | undefined) ?? (merged.condition as string | undefined)
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
  merged.marketplaceSummary = take(previous.marketplaceSummary, next.marketplaceSummary);

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

  merged.photoRequested = previous.photoRequested || next.photoRequested || photos.length > 0;

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

  const currentPhotos: string[] = Array.isArray(row?.photo_urls)
    ? (row!.photo_urls as string[])
    : [];
  const mergedPhotos = [...currentPhotos, ...mediaUrls];

  const previousListingState: ListingState =
    (row?.listing_state as ListingState | null) ?? {};

  // Deterministic first-step behavior: if we have no photos yet for this user
  // and we've never explicitly asked them for photos, send a one-time prompt
  // without involving the model. This avoids the model getting stuck repeating
  // the same question.
  if ((mergedPhotos.length === 0 || mergedPhotos.every((p) => !p)) && !previousListingState.photoRequested) {
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
        item_name: listingState.itemTitle ?? row?.item_name ?? null,
        condition: listingState.condition ?? row?.condition ?? null,
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
- Do as much work as possible yourself: infer details from photos and previous messages, and fill in reasonable defaults.
- Be explicit about any guesses or assumptions in the structured state, but avoid overwhelming the user with questions.

Information you should aim to capture in \`listing_state\`:
- Core identity:
  - itemTitle (clear, compelling, eBay-style)
  - brand, model, categoryPath (e.g. "Clothing > Sneakers > Nike")
  - size, color, style/gender if relevant
- Condition:
  - condition (e.g. "New", "New without tags", "Used – like new", "Used – good", etc.)
  - conditionDetails (short human description, including wear/tear)
- Contents:
  - includedAccessories (list of things included: box, charger, laces, manuals, etc.)
  - missingAccessories (things typically included but missing, if any)
  - defects (visible damage, marks, issues)
- Photos:
  - photos: array of URLs (Twilio MediaUrl0, MediaUrl1, etc.). Merge new photos with existing ones.
- Pricing / comps:
  - estimatedPrice: { currency, amount, reasoning }
  - comparableListings: array of { title, url (optional), price {currency, amount}, notes }
  - You can assume currency from context (USD if unknown).
- Shipping:
  - shipping: { weightKg, dimensionsCm {length,width,height}, notes }
- Marketplace-ready output:
  - marketplaceSummary.ebay:
    - title: final eBay-ready title (max ~80 chars, important keywords first)
    - subtitle: optional short extra hook
    - descriptionHtml: rich but concise HTML description (paragraphs + bullet lists)
    - itemSpecifics: key–value map of structured attributes (Brand, Model, Size, Color, Style, Department, Type, Condition, etc.)

Conversation behavior:
- If you don't have any photos yet, start by asking the user to send **one or more photos _or_ a quick description** of the item.
- If the user clearly prefers not to send photos (or keeps replying with text only), **do not keep repeating the same photo request**. Continue the flow using whatever information you have.
- When you have at least one photo, start inferring:
  - Brand, model, color, material, style, approximate condition.
  - Ask the user to confirm only the most important uncertain details (e.g. exact model, size).
- You can and should visually inspect all attached images (they are of the same item).
- If the user corrects you (e.g. \"it's a lamp, not sneakers\"), **immediately trust the correction**, update listing_state, and do not repeat the same mistake.
- You **do not** actually fetch live data or real URLs. For comparableListings, you may invent realistic but clearly-marked example comps based on your knowledge.
- Try to limit questions to 1–2 at a time, and prefer yes/no or small-choice confirmations.
- When you feel the listing is good enough to post (title, description, price, key specifics), set \`listing_state.isComplete = true\`.

Important:
- The user interacts over WhatsApp/SMS one message at a time.
- Your reply must be short, friendly, and conversational (1–3 short sentences, plus a simple question when needed).
- Do **not** mention that you are calling any APIs, or talk about JSON or schemas in the message to the user.
- Never ask for information we clearly already know from previous messages or photos unless you need clarification.

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
    // Fallback if not configured
    return {
      message:
        "We’re not fully set up yet. Please try again later while we connect our listing assistant.",
    };
  }

  let modelReply: ModelResponse;

  try {
    // Try to convert the latest Twilio media URLs into inline data URLs OpenAI can see.
    const imageDataUrls = await Promise.all(
      mediaUrls.slice(0, 3).map((u) => fetchTwilioImageAsDataUrl(u))
    );
    const visionParts = imageDataUrls
      .filter((u): u is string => !!u)
      .map((dataUrl) => ({
        type: "image_url" as const,
        image_url: { url: dataUrl },
      }));

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
            content:
              visionParts.length === 0
                ? JSON.stringify({
                    user_message: body,
                    previous_listing_state: previousListingState,
                    all_photo_urls: mergedPhotos,
                  })
                : [
                    {
                      type: "text",
                      text: JSON.stringify({
                        user_message: body,
                        previous_listing_state: previousListingState,
                        all_photo_urls: mergedPhotos,
                      }),
                    },
                    ...visionParts,
                  ],
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
      json.choices?.[0]?.message?.content ?? '{"reply_text":"Sorry, I had trouble understanding that. Please try again.","listing_state":{}}';

    modelReply = JSON.parse(rawContent) as ModelResponse;
  } catch (err) {
    console.error("[conversation] Failed to talk to OpenAI:", err);
    return {
      message:
        "Something went wrong on our side while drafting your listing. Please try again in a moment.",
    };
  }

  const listingState: ListingState = mergeListingState(
    previousListingState,
    modelReply.listing_state ?? {},
    mergedPhotos,
    body,
    modelReply.reply_text
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
    message: modelReply.reply_text,
  };
}

