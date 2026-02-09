/**
 * Listing intake: agent does research; user confirms.
 * Server controls stages. LLM only extracts/ranks facts and suggests one question.
 */

import {
  getSupabase,
  type ListingDraft,
  type DraftFact,
  type PendingPrompt,
} from "./supabase";
import { storeInboundMedia, registerStorageUrls } from "./storage";
import { runResearch, type VisionResult, type EbayItemSummary } from "./research";

export function normalizeBody(body: string): string {
  return body?.trim() ?? "";
}

export type ProcessInput = {
  from: string;
  body: string;
  mediaUrls: string[];
};

export type ChoiceOption = { label: string; value: string };

export type ProcessResult = {
  message: string;
  /** When present, UI should show these buttons instead of free text for deterministic reply */
  choices?: ChoiceOption[];
};

const CONDITION_CHOICES: ChoiceOption[] = [
  { label: "New with tags", value: "New with tags" },
  { label: "Used – Like New", value: "Used – Like New" },
  { label: "Used – Good", value: "Used – Good" },
  { label: "Used – Acceptable", value: "Used – Acceptable" },
];

const PRICE_TYPE_CHOICES: ChoiceOption[] = [
  { label: "Quick sale", value: "quick_sale" },
  { label: "Best price", value: "best_price" },
];

const FINAL_CONFIRM_CHOICES: ChoiceOption[] = [
  { label: "List it", value: "yes" },
  { label: "Not yet", value: "no" },
];

const IDENTITY_CONFIRM_CHOICES: ChoiceOption[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

const STAGES = [
  "awaiting_photos",
  "researching_identity",
  "confirm_identity",
  "confirm_size",
  "confirm_condition",
  "pricing",
  "final_confirm",
  "complete",
] as const;

export type Stage = (typeof STAGES)[number];

function isTrigger(body: string): boolean {
  if (!body || typeof body !== "string") return false;
  const n = normalizeBody(body)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return (
    n === "i want to sell something" ||
    (n.includes("want") && n.includes("sell"))
  );
}

// —— Deterministic parsers (no LLM) ——
const CONDITION_CANONICAL: Record<string, string> = {
  "new with tags": "New with tags",
  "new with tag": "New with tags",
  "nwt": "New with tags",
  "like new": "Used – Like New",
  "used like new": "Used – Like New",
  "good": "Used – Good",
  "used good": "Used – Good",
  "acceptable": "Used – Acceptable",
  "used acceptable": "Used – Acceptable",
};

function parseConditionReply(body: string): string | null {
  const n = normalizeBody(body).toLowerCase().replace(/\s+/g, " ");
  if (!n) return null;
  for (const [key, canonical] of Object.entries(CONDITION_CANONICAL)) {
    if (n === key || n.includes(key)) return canonical;
  }
  if (n.includes("new") && n.includes("tag")) return "New with tags";
  if (n.includes("like new")) return "Used – Like New";
  if (n.includes("acceptable")) return "Used – Acceptable";
  return null;
}

function parseSizeReply(body: string): string | null {
  const n = normalizeBody(body);
  return n.length >= 1 ? n : null;
}

function parsePriceTypeReply(
  body: string
): "quick_sale" | "best_price" | null {
  const n = normalizeBody(body).toLowerCase();
  if (/quick|fast/.test(n)) return "quick_sale";
  if (/best|max/.test(n)) return "best_price";
  return null;
}

function parseFloorPrice(body: string): string | null {
  const match = normalizeBody(body).match(/\$?(\d+(?:\.\d{2})?)/);
  return match ? match[1] : null;
}

function parseFinalYesNo(body: string): boolean | null {
  const n = normalizeBody(body).toLowerCase();
  if (/^(yes|yeah|yep|sure|list|list it|do it)$/.test(n)) return true;
  if (/^(no|nope|nah|not yet|wait)$/.test(n)) return false;
  return null;
}

function isOnlyNo(body: string): boolean {
  const n = normalizeBody(body).toLowerCase();
  return /^(no|nope|nah|not really|nope\.?|no\.?)$/.test(n);
}

function isYes(body: string): boolean {
  const n = normalizeBody(body).toLowerCase();
  return /^(yes|yeah|yep|sure|correct|sounds good|that's right|that is right|yup)$/.test(n);
}

// —— User & draft (server-controlled) ——
async function getOrCreateUser(phoneNumber: string): Promise<{ id: string }> {
  const supabase = getSupabase();
  const { data: existing } = await supabase
    .from("sms_users")
    .select("id")
    .eq("phone_number", phoneNumber)
    .single();
  if (existing) return { id: existing.id };
  const { data: inserted, error } = await supabase
    .from("sms_users")
    .insert({ phone_number: phoneNumber })
    .select("id")
    .single();
  if (error) throw new Error("Failed to create user");
  return { id: inserted!.id };
}

async function getActiveDraft(userId: string): Promise<ListingDraft | null> {
  const { data } = await getSupabase()
    .from("listing_drafts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  return data as ListingDraft | null;
}

async function createDraft(userId: string): Promise<ListingDraft> {
  const { data, error } = await getSupabase()
    .from("listing_drafts")
    .insert({
      user_id: userId,
      status: "active",
      stage: "awaiting_photos",
    })
    .select()
    .single();
  if (error) throw new Error("Failed to create draft");
  return data as ListingDraft;
}

async function abandonActiveDrafts(userId: string): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active");
}

async function updateDraftStage(draftId: string, stage: Stage): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", draftId);
}

export async function setPending(
  draftId: string,
  pending: PendingPrompt
): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ pending, updated_at: new Date().toISOString() })
    .eq("id", draftId);
}

export async function clearPending(draftId: string): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ pending: null, updated_at: new Date().toISOString() })
    .eq("id", draftId);
}

// —— Fact helpers: always read from DB after writes to avoid drift ——
export async function getConfirmedValue(
  draftId: string,
  key: string
): Promise<unknown> {
  const { data } = await getSupabase()
    .from("draft_facts")
    .select("value")
    .eq("draft_id", draftId)
    .eq("key", key)
    .eq("status", "confirmed")
    .maybeSingle();
  return (data as { value: unknown } | null)?.value ?? null;
}

export async function getProposedValue(
  draftId: string,
  key: string
): Promise<unknown> {
  const { data } = await getSupabase()
    .from("draft_facts")
    .select("value")
    .eq("draft_id", draftId)
    .eq("key", key)
    .eq("status", "proposed")
    .maybeSingle();
  return (data as { value: unknown } | null)?.value ?? null;
}

// —— Facts: only CONFIRMED advance; server sets confirmed ——
async function getFactsByDraft(draftId: string): Promise<DraftFact[]> {
  const { data } = await getSupabase()
    .from("draft_facts")
    .select("*")
    .eq("draft_id", draftId);
  return (data ?? []) as DraftFact[];
}

async function upsertFact(
  draftId: string,
  key: string,
  value: unknown,
  confidence: number,
  source: string,
  status: "proposed" | "confirmed" | "rejected",
  evidence?: unknown
): Promise<void> {
  const now = new Date().toISOString();
  await getSupabase()
    .from("draft_facts")
    .upsert(
      {
        draft_id: draftId,
        key,
        value,
        confidence,
        source,
        status,
        evidence: evidence ?? [],
        updated_at: now,
      },
      { onConflict: "draft_id,key" }
    );
}

async function confirmFact(draftId: string, key: string, value: unknown): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("draft_facts")
    .update({ value, status: "confirmed", updated_at: now })
    .eq("draft_id", draftId)
    .eq("key", key)
    .select("id");

  // If the fact row doesn't exist yet, update() affects 0 rows.
  // In that case, insert it as confirmed so stages can advance.
  if (!data || data.length === 0) {
    await supabase.from("draft_facts").upsert(
      {
        draft_id: draftId,
        key,
        value,
        confidence: 1,
        source: "user",
        status: "confirmed",
        evidence: [],
        updated_at: now,
      },
      { onConflict: "draft_id,key" }
    );
  }
}

// —— Persist inbound/outbound message ——
async function saveMessage(
  draftId: string,
  direction: "in" | "out",
  body: string,
  twilioUrls: string[],
  storageUrls: string[]
): Promise<void> {
  await getSupabase().from("draft_messages").insert({
    draft_id: draftId,
    direction,
    body,
    twilio_media_urls: twilioUrls,
    storage_media_urls: storageUrls,
  });
}

// —— LLM: extraction + one recommended question (server decides whether to use it) ——
const EXTRACTION_SYSTEM = `You are an extraction helper for a clothing listing flow. You do NOT control the flow.

Inputs: vision inference (item name + search query), optional eBay search results (when provided), current draft facts, and the latest user message. When eBay results are missing or empty, infer from the vision result and your own knowledge (use standard eBay-style condition terms: "New with tags", "Used – Like New", "Used – Good", "Used – Acceptable", etc.).

Output ONLY valid JSON with:
1. "proposedFacts": array of { "key": string, "value": any, "confidence": number 0-1, "source": string, "evidence": string[] }
   Keys we care about: identity (short item name, e.g. "Men's Nike Hoodie"), size (e.g. "M"), condition (eBay-style), brand, color.
2. "recommendedQuestion": a single short question for the user (e.g. "Is this a Men's Nike hoodie?", "What size is it?", "I'd list condition as 'Used – Good'. Sound right?").

Do NOT mark facts as confirmed. Be concise. Use eBay condition terms when suggesting condition.`;

type ExtractionOutput = {
  proposedFacts?: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: string;
    evidence?: string[];
  }>;
  recommendedQuestion?: string;
};

async function runExtraction(
  visionResult: VisionResult | null,
  ebayResults: EbayItemSummary[],
  currentFacts: DraftFact[],
  userMessage: string
): Promise<ExtractionOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return {};

  const ebaySummary = ebayResults.slice(0, 15).map((i) => ({
    title: i.title,
    condition: i.condition,
    price: i.price?.value,
  }));

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
          {
            role: "user",
            content: JSON.stringify({
              vision: visionResult
                ? { inferredItem: visionResult.inferredItem, searchQuery: visionResult.searchQuery }
                : null,
              ebay_sample: ebaySummary,
              current_facts: currentFacts.map((f) => ({
                key: f.key,
                value: f.value,
                status: f.status,
              })),
              user_message: userMessage,
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return {};
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return {};
    return JSON.parse(raw) as ExtractionOutput;
  } catch {
    return {};
  }
}

// —— LLM: resolve item identity from user input + conversation context ——
const RESOLVE_IDENTITY_SYSTEM = `You resolve a product name for a listing. You have:
- "userInput": what the user said (e.g. "air force ones", "jordan 1 lows").
- "proposedFromVision": what we inferred from the photo (e.g. "Men's Air Jordan 1 Retro High OG").
- "conversationSummary": recent back-and-forth and any known details (size, condition, etc.).

Your job: output a single short, canonical product name that matches the user's input AND fits the conversation/context. Use common product naming (e.g. "Nike Air Force 1", "Nike Air Jordan 1 Low"). If the user is unsure or asked you to find it, use their wording plus context to pick the best match. If you truly can't determine a product, return the user input cleaned up (e.g. "air force ones" -> "Nike Air Force 1").

Output ONLY valid JSON: { "identity": "short product name string" }`;

async function resolveItemIdentity(
  userInput: string,
  context: {
    proposedFromVision?: string;
    conversationSummary: string;
  }
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const trimmed = normalizeBody(userInput);
  if (!trimmed) return userInput;
  if (!apiKey) return trimmed;

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
          { role: "system", content: RESOLVE_IDENTITY_SYSTEM },
          {
            role: "user",
            content: JSON.stringify({
              userInput: trimmed,
              proposedFromVision: context.proposedFromVision ?? null,
              conversationSummary: context.conversationSummary,
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return trimmed;
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return trimmed;
    const out = JSON.parse(raw) as { identity?: string };
    const identity = out.identity?.trim();
    return identity || trimmed;
  } catch {
    return trimmed;
  }
}

async function getRecentDraftMessages(
  draftId: string,
  limit: number
): Promise<Array<{ direction: string; body: string }>> {
  const { data } = await getSupabase()
    .from("draft_messages")
    .select("direction, body")
    .eq("draft_id", draftId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{ direction: string; body: string }>;
}

// —— Helpers: draft photos (user) ——
async function getDraftUserPhotoUrls(draftId: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from("draft_photos")
    .select("storage_url")
    .eq("draft_id", draftId)
    .eq("kind", "user")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r: { storage_url: string }) => r.storage_url);
}

export async function processInboundMessage(
  input: ProcessInput
): Promise<ProcessResult> {
  const { from, body, mediaUrls } = input;

  // —— Trigger: abandon current draft, start new ——
  if (isTrigger(body)) {
    const user = await getOrCreateUser(from);
    await abandonActiveDrafts(user.id);
    const draft = await createDraft(user.id);
    await saveMessage(draft.id, "in", body, mediaUrls, []);
    const reply =
      "Send at least one photo of the item to get started.";
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply };
  }

  const user = await getOrCreateUser(from);
  let draft = await getActiveDraft(user.id);
  if (!draft) draft = await createDraft(user.id);

  const isAppStorage =
    mediaUrls.length > 0 &&
    mediaUrls.some((u) => typeof u === "string" && u.includes("supabase"));
  const storageUrls =
    mediaUrls.length > 0
      ? isAppStorage
        ? await registerStorageUrls(mediaUrls, draft.id)
        : await storeInboundMedia(mediaUrls, draft.id)
      : [];
  await saveMessage(draft.id, "in", body, mediaUrls, storageUrls);

  const pending = draft.pending ?? null;
  const userPhotoUrls = await getDraftUserPhotoUrls(draft.id);
  let reply: string;

  if (pending) {
    await clearPending(draft.id);
    switch (pending.type) {
      case "confirm_identity": {
        const proposedIdentity = pending.proposedIdentity || "item";
        if (isOnlyNo(body)) {
          reply =
            "Can you send a photo of the label or tag? Or tell me what you'd call this item.";
          await setPending(draft.id, { type: "confirm_identity", proposedIdentity });
          await saveMessage(draft.id, "out", reply, [], []);
          return { message: reply };
        }
        if (isYes(body)) {
          await confirmFact(draft.id, "identity", proposedIdentity);
          await updateDraftStage(draft.id, "confirm_size");
          await setPending(draft.id, { type: "confirm_size" });
          reply = "What size is it?";
          await saveMessage(draft.id, "out", reply, [], []);
          return { message: reply };
        }
        const recent = await getRecentDraftMessages(draft.id, 12);
        const conversationSummary = recent
          .reverse()
          .map((m) => `${m.direction}: ${m.body}`)
          .join("\n");
        const resolved = await resolveItemIdentity(normalizeBody(body), {
          proposedFromVision: proposedIdentity,
          conversationSummary,
        });
        if (resolved && resolved.length >= 2) {
          await confirmFact(draft.id, "identity", resolved);
          await updateDraftStage(draft.id, "confirm_size");
          await setPending(draft.id, { type: "confirm_size" });
          reply = "What size is it?";
        } else {
          reply =
            "What would you call this item? (e.g. Air Jordan 1 Lows, vintage jacket)";
          await setPending(draft.id, { type: "confirm_identity", proposedIdentity });
        }
        await saveMessage(draft.id, "out", reply, [], []);
        return { message: reply };
      }
      case "confirm_size": {
        const size = parseSizeReply(body);
        if (size) {
          await confirmFact(draft.id, "size", size);
          await updateDraftStage(draft.id, "confirm_condition");
          const suggested =
            (await getProposedValue(draft.id, "condition")) ?? "Used – Good";
          const suggestedStr =
            typeof suggested === "string" ? suggested : "Used – Good";
          reply = `I'd list the condition as '${suggestedStr}'. Does that sound right?`;
          await setPending(draft.id, { type: "choose_condition", suggested: suggestedStr });
        } else {
          reply = "What size is it?";
          await setPending(draft.id, { type: "confirm_size" });
        }
        await saveMessage(draft.id, "out", reply, [], []);
        return {
          message: reply,
          choices: reply.includes("condition") ? CONDITION_CHOICES : undefined,
        };
      }
      case "choose_condition": {
        const suggested = pending.suggested ?? "Used – Good";
        const conditionFromReply = parseConditionReply(body);
        if (isYes(body) && suggested) {
          await confirmFact(draft.id, "condition", suggested);
          await updateDraftStage(draft.id, "pricing");
          await setPending(draft.id, { type: "price_type" });
          reply = "Quick sale or best price?";
        } else if (conditionFromReply) {
          await confirmFact(draft.id, "condition", conditionFromReply);
          await updateDraftStage(draft.id, "pricing");
          await setPending(draft.id, { type: "price_type" });
          reply = "Quick sale or best price?";
        } else {
          reply =
            "Got it — what condition should I use? (New with tags / Used – Like New / Used – Good / Used – Acceptable)";
          await setPending(draft.id, { type: "choose_condition", suggested });
        }
        await saveMessage(draft.id, "out", reply, [], []);
        return {
          message: reply,
          choices: reply.includes("Quick sale") ? PRICE_TYPE_CHOICES : CONDITION_CHOICES,
        };
      }
      case "price_type": {
        const priceType = parsePriceTypeReply(body);
        if (priceType) {
          await confirmFact(draft.id, "price_type", priceType);
          await setPending(draft.id, { type: "floor_price" });
          reply = "What's your absolute floor price? (e.g. 25 or $25)";
        } else {
          reply = "Quick sale or best price?";
          await setPending(draft.id, { type: "price_type" });
        }
        await saveMessage(draft.id, "out", reply, [], []);
        return {
          message: reply,
          choices: reply.includes("Quick sale") ? PRICE_TYPE_CHOICES : undefined,
        };
      }
      case "floor_price": {
        const floor = parseFloorPrice(body);
        if (floor) {
          await confirmFact(draft.id, "floor_price", floor);
          await updateDraftStage(draft.id, "final_confirm");
          const [idVal, sizeVal, condVal] = await Promise.all([
            getConfirmedValue(draft.id, "identity"),
            getConfirmedValue(draft.id, "size"),
            getConfirmedValue(draft.id, "condition"),
          ]);
          const summary = `Summary: ${idVal ?? "Item"} | Size: ${sizeVal ?? "—"} | Condition: ${condVal ?? "—"} | Floor: $${floor}. List it? (yes / not yet)`;
          await setPending(draft.id, { type: "final_confirm", summary });
          reply = summary;
        } else {
          reply = "What's your absolute floor price? (e.g. 25 or $25)";
          await setPending(draft.id, { type: "floor_price" });
        }
        await saveMessage(draft.id, "out", reply, [], []);
        return {
          message: reply,
          choices: reply.includes("List it?") ? FINAL_CONFIRM_CHOICES : undefined,
        };
      }
      case "final_confirm": {
        const listNow = parseFinalYesNo(body);
        if (listNow === true) {
          await getSupabase()
            .from("listing_drafts")
            .update({
              stage: "complete",
              status: "complete",
              pending: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", draft.id);
          reply = "You're all set. We'll be in touch.";
        } else {
          reply = "No problem — say when you're ready to list.";
        }
        await saveMessage(draft.id, "out", reply, [], []);
        return { message: reply };
      }
    }
  }

  const stage = draft.stage as Stage;
  if (stage === "complete") {
    reply =
      "You're all set. Text \"i want to sell something\" to start a new listing.";
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply };
  }

  // Fallback: if pending is missing but we're in confirm_identity, still handle
  if (!pending && stage === "confirm_identity") {
    const proposedFromFacts =
      (await getProposedValue(draft.id, "identity")) ??
      (await getConfirmedValue(draft.id, "identity")) ??
      "item";
    const proposedIdentity =
      typeof proposedFromFacts === "string"
        ? proposedFromFacts
        : String(proposedFromFacts ?? "item");

    if (isOnlyNo(body)) {
      reply =
        "Can you send a photo of the label or tag? Or tell me what you'd call this item.";
      await setPending(draft.id, {
        type: "confirm_identity",
        proposedIdentity,
      });
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    if (isYes(body)) {
      await confirmFact(draft.id, "identity", proposedIdentity);
      await updateDraftStage(draft.id, "confirm_size");
      await setPending(draft.id, { type: "confirm_size" });
      reply = "What size is it?";
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    const recent = await getRecentDraftMessages(draft.id, 12);
    const conversationSummary = recent
      .reverse()
      .map((m) => `${m.direction}: ${m.body}`)
      .join("\n");
    const resolved = await resolveItemIdentity(normalizeBody(body), {
      proposedFromVision: proposedIdentity,
      conversationSummary,
    });
    if (resolved && resolved.length >= 2) {
      await confirmFact(draft.id, "identity", resolved);
      await updateDraftStage(draft.id, "confirm_size");
      await setPending(draft.id, { type: "confirm_size" });
      reply = "What size is it?";
    } else {
      reply =
        "What would you call this item? (e.g. Air Jordan 1 Lows, vintage jacket)";
      await setPending(draft.id, {
        type: "confirm_identity",
        proposedIdentity,
      });
    }
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply };
  }

  // Fallback: pending missing but we're in confirm_size — treat body as size
  if (!pending && stage === "confirm_size") {
    const size = parseSizeReply(body);
    if (size) {
      await confirmFact(draft.id, "size", size);
      await updateDraftStage(draft.id, "confirm_condition");
      const suggested =
        (await getProposedValue(draft.id, "condition")) ?? "Used – Good";
      const suggestedStr =
        typeof suggested === "string" ? suggested : "Used – Good";
      reply = `I'd list the condition as '${suggestedStr}'. Does that sound right?`;
      await setPending(draft.id, {
        type: "choose_condition",
        suggested: suggestedStr,
      });
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply, choices: CONDITION_CHOICES };
    }
    reply = "What size is it?";
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply };
  }

  // Fallback: pending missing but we're in confirm_condition — parse condition
  if (!pending && stage === "confirm_condition") {
    const suggested =
      (await getProposedValue(draft.id, "condition")) ?? "Used – Good";
    const suggestedStr =
      typeof suggested === "string" ? suggested : "Used – Good";
    const conditionFromReply = parseConditionReply(body);
    if (isYes(body) && suggestedStr) {
      await confirmFact(draft.id, "condition", suggestedStr);
      await updateDraftStage(draft.id, "pricing");
      await setPending(draft.id, { type: "price_type" });
      reply = "Quick sale or best price?";
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply, choices: PRICE_TYPE_CHOICES };
    }
    if (conditionFromReply) {
      await confirmFact(draft.id, "condition", conditionFromReply);
      await updateDraftStage(draft.id, "pricing");
      await setPending(draft.id, { type: "price_type" });
      reply = "Quick sale or best price?";
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply, choices: PRICE_TYPE_CHOICES };
    }
    reply =
      "Got it — what condition should I use? (New with tags / Used – Like New / Used – Good / Used – Acceptable)";
    await setPending(draft.id, { type: "choose_condition", suggested: suggestedStr });
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply, choices: CONDITION_CHOICES };
  }

  // Fallback: pending missing but we're in pricing — parse price_type or floor_price
  if (!pending && stage === "pricing") {
    const hasPriceType =
      (await getConfirmedValue(draft.id, "price_type")) != null;
    if (!hasPriceType) {
      const priceType = parsePriceTypeReply(body);
      if (priceType) {
        await confirmFact(draft.id, "price_type", priceType);
        await setPending(draft.id, { type: "floor_price" });
        reply = "What's your absolute floor price? (e.g. 25 or $25)";
        await saveMessage(draft.id, "out", reply, [], []);
        return { message: reply };
      }
      reply = "Quick sale or best price?";
      await setPending(draft.id, { type: "price_type" });
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply, choices: PRICE_TYPE_CHOICES };
    }
    const floor = parseFloorPrice(body);
    if (floor) {
      await confirmFact(draft.id, "floor_price", floor);
      await updateDraftStage(draft.id, "final_confirm");
      const [idVal, sizeVal, condVal] = await Promise.all([
        getConfirmedValue(draft.id, "identity"),
        getConfirmedValue(draft.id, "size"),
        getConfirmedValue(draft.id, "condition"),
      ]);
      reply = `Summary: ${idVal ?? "Item"} | Size: ${sizeVal ?? "—"} | Condition: ${condVal ?? "—"} | Floor: $${floor}. List it? (yes / not yet)`;
      await setPending(draft.id, { type: "final_confirm", summary: reply });
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply, choices: FINAL_CONFIRM_CHOICES };
    }
    reply = "What's your absolute floor price? (e.g. 25 or $25)";
    await setPending(draft.id, { type: "floor_price" });
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply };
  }

  // Fallback: pending missing but we're in final_confirm — parse yes/no
  if (!pending && stage === "final_confirm") {
    const listNow = parseFinalYesNo(body);
    if (listNow === true) {
      await getSupabase()
        .from("listing_drafts")
        .update({
          stage: "complete",
          status: "complete",
          pending: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);
      reply = "You're all set. We'll be in touch.";
    } else {
      reply = "No problem — say when you're ready to list.";
    }
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply };
  }

  if (stage === "awaiting_photos") {
      if (userPhotoUrls.length === 0 && storageUrls.length === 0) {
        reply = "Please send at least one photo of the item.";
        await saveMessage(draft.id, "out", reply, [], []);
        await updateDraftStage(draft.id, "awaiting_photos");
        return { message: reply };
      }
      const firstImageUrl = userPhotoUrls[0] || storageUrls[0];
      if (!firstImageUrl) {
        reply = "Please send at least one photo of the item.";
        await saveMessage(draft.id, "out", reply, [], []);
        return { message: reply };
      }
      await saveMessage(draft.id, "out", "Working…", [], []);
      await updateDraftStage(draft.id, "researching_identity");
      const research = await runResearch(draft.id, firstImageUrl, null);
      const factsAfterResearch = await getFactsByDraft(draft.id);
      const extraction = await runExtraction(
        research.vision,
        research.ebay,
        factsAfterResearch,
        body
      );
      const proposed = extraction.proposedFacts ?? [];
      for (const f of proposed) {
        await upsertFact(
          draft.id,
          f.key,
          f.value,
          f.confidence,
          f.source,
          "proposed",
          f.evidence
        );
      }
      const proposedIdentity =
        proposed.find((f) => f.key === "identity")?.value ??
        research.vision?.inferredItem;
      const proposedIdentityStr =
        proposedIdentity != null ? String(proposedIdentity) : "";
      const lowConfidence =
        (proposed.find((f) => f.key === "identity")?.confidence ?? 0) < 0.6 ||
        research.visionStatus !== "success";

      await updateDraftStage(draft.id, "confirm_identity");
      if (lowConfidence) {
        reply =
          "I couldn't identify this with much confidence. Can you send a photo of the label or tag? Or tell me what you'd call it.";
        await setPending(draft.id, {
          type: "confirm_identity",
          proposedIdentity: proposedIdentityStr || "item",
        });
      } else if (proposedIdentityStr && proposedIdentityStr !== "item") {
        reply = `Is this a ${proposedIdentityStr}? (Or tell me what you'd call it.)`;
        await setPending(draft.id, {
          type: "confirm_identity",
          proposedIdentity: proposedIdentityStr,
        });
        await saveMessage(draft.id, "out", reply, [], []);
        return { message: reply, choices: IDENTITY_CONFIRM_CHOICES };
      } else {
        reply =
          "What would you call this item? (e.g. Air Jordan 1 Lows, vintage jacket)";
        await setPending(draft.id, {
          type: "confirm_identity",
          proposedIdentity: "item",
        });
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
  }

  if (stage === "researching_identity") {
    reply = "Please send at least one photo of the item (or the label/tag).";
    await saveMessage(draft.id, "out", reply, [], []);
    return { message: reply };
  }

  reply = "Send at least one photo of the item to get started.";
  await saveMessage(draft.id, "out", reply, [], []);
  return { message: reply };
}

