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
  isComplete?: boolean;
};

type ModelResponse = {
  reply_text: string;
  listing_state: ListingState;
};

const OPENAI_MODEL = "gpt-4o-mini";

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
- **Always start** by asking for one or more **photos** of the item if you don't have any yet.
- If the user sends text before photos, gently ask for photos next.
- When you have at least one photo, start inferring:
  - Brand, model, color, material, style, approximate condition.
  - Ask the user to confirm only the most important uncertain details (e.g. exact model, size).
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

  const userPayload = {
    user_message: body,
    media_urls: mediaUrls,
    all_photo_urls: mergedPhotos,
    previous_listing_state: previousListingState,
  };

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
            content: JSON.stringify(userPayload),
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

  const listingState: ListingState = {
    ...previousListingState,
    ...modelReply.listing_state,
    photos: mergedPhotos,
  };

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

