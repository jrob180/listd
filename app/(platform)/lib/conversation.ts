/**
 * Listing intake: agent does research; user confirms.
 * Server controls stages. LLM only extracts/ranks facts and suggests one question.
 */

import { getSupabase, type ListingDraft, type DraftFact } from "./supabase";
import { storeInboundMedia } from "./storage";
import { runResearch, type VisionResult, type EbayItemSummary } from "./research";

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

// —— Facts: only CONFIRMED advance; server sets confirmed ——
async function getFactsByDraft(draftId: string): Promise<DraftFact[]> {
  const { data } = await getSupabase()
    .from("draft_facts")
    .select("*")
    .eq("draft_id", draftId);
  return (data ?? []) as DraftFact[];
}

async function getConfirmedFact(draftId: string, key: string): Promise<unknown> {
  const { data } = await getSupabase()
    .from("draft_facts")
    .select("value")
    .eq("draft_id", draftId)
    .eq("key", key)
    .eq("status", "confirmed")
    .maybeSingle();
  return (data as { value: unknown } | null)?.value ?? null;
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
  const now = new Date().toISOString();
  await getSupabase()
    .from("draft_facts")
    .update({ value, status: "confirmed", updated_at: now })
    .eq("draft_id", draftId)
    .eq("key", key);
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
  const now = new Date().toISOString();

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

  const storageUrls =
    mediaUrls.length > 0 ? await storeInboundMedia(mediaUrls, draft.id) : [];
  await saveMessage(draft.id, "in", body, mediaUrls, storageUrls);

  const stage = draft.stage as Stage;
  const facts = await getFactsByDraft(draft.id);
  const userPhotoUrls = await getDraftUserPhotoUrls(draft.id);

  let reply: string;
  let nextStage: Stage = stage;

  switch (stage) {
    case "awaiting_photos": {
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
      // Optional "Working…" – we can send it then do research; for simplicity we do research then one reply
      nextStage = "researching_identity";
      await updateDraftStage(draft.id, nextStage);
      const research = await runResearch(draft.id, firstImageUrl, null);
      const extraction = await runExtraction(
        research.vision,
        research.ebay,
        facts,
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
      const identityFact = proposed.find((f) => f.key === "identity");
      const lowConfidence =
        (identityFact?.confidence ?? 0) < 0.6 || research.visionStatus !== "success";
      if (lowConfidence) {
        reply =
          "I couldn’t identify this with much confidence. Can you send a photo of the label or tag?";
        nextStage = "awaiting_photos"; // allow more photos
        await updateDraftStage(draft.id, nextStage);
      } else {
        nextStage = "confirm_identity";
        await updateDraftStage(draft.id, nextStage);
        reply =
          extraction.recommendedQuestion?.trim() ||
          `Is this a ${identityFact?.value ?? "item"}?`;
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "researching_identity": {
      // Can receive more photos (e.g. label)
      if (storageUrls.length > 0) {
        const firstImageUrl = userPhotoUrls[0] || storageUrls[0];
        const research = await runResearch(draft.id, firstImageUrl, null);
        const updatedFacts = await getFactsByDraft(draft.id);
        const extraction = await runExtraction(
          research.vision,
          research.ebay,
          updatedFacts,
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
        nextStage = "confirm_identity";
        await updateDraftStage(draft.id, nextStage);
        reply =
          extraction.recommendedQuestion?.trim() ||
          "What would you call this item?";
      } else {
        reply =
          "Please send at least one photo of the item (or the label/tag).";
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "confirm_identity": {
      const norm = normalizeBody(body);
      const identityFact = facts.find((f) => f.key === "identity");
      const proposedIdentity =
        typeof identityFact?.value === "string"
          ? identityFact.value
          : identityFact?.value != null
            ? String(identityFact.value)
            : "item";
      if (/^(yes|yeah|yep|sure|y|correct|right|sounds good)$/i.test(norm)) {
        await confirmFact(draft.id, "identity", proposedIdentity);
        nextStage = "confirm_size";
        await updateDraftStage(draft.id, nextStage);
        reply = "What size is it?";
      } else if (norm.length >= 2) {
        await confirmFact(draft.id, "identity", norm);
        nextStage = "confirm_size";
        await updateDraftStage(draft.id, nextStage);
        reply = "What size is it?";
      } else {
        reply = `Is this a ${proposedIdentity || "item"}? (Reply with yes or the correct name.)`;
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "confirm_size": {
      const norm = normalizeBody(body);
      if (norm.length >= 1) {
        await upsertFact(draft.id, "size", norm, 1, "user", "confirmed", []);
        nextStage = "confirm_condition";
        await updateDraftStage(draft.id, nextStage);
        const conditionFact = facts.find((f) => f.key === "condition");
        const suggested =
          typeof conditionFact?.value === "string"
            ? conditionFact.value
            : "Used – Good";
        reply = `I'd list the condition as '${suggested}'. Does that sound right?`;
      } else {
        reply = "What size is it?";
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "confirm_condition": {
      const norm = normalizeBody(body);
      const conditionFact = facts.find((f) => f.key === "condition");
      const suggested =
        typeof conditionFact?.value === "string"
          ? conditionFact.value
          : "Used – Good";
      if (/^(yes|yeah|yep|sure|y|correct|right|sounds good)$/i.test(norm)) {
        await confirmFact(draft.id, "condition", suggested);
        nextStage = "pricing";
        await updateDraftStage(draft.id, nextStage);
        reply = "Quick sale or best price?";
      } else if (norm.length >= 2) {
        await confirmFact(draft.id, "condition", norm);
        nextStage = "pricing";
        await updateDraftStage(draft.id, nextStage);
        reply = "Quick sale or best price?";
      } else {
        reply = `I'd list the condition as '${suggested}'. Does that sound right?`;
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "pricing": {
      const norm = normalizeBody(body).toLowerCase();
      const hasPriceType = facts.some((f) => f.key === "price_type" && f.status === "confirmed");
      if (!hasPriceType) {
        if (norm.includes("quick") || norm.includes("fast")) {
          await confirmFact(draft.id, "price_type", "quick_sale");
        } else if (norm.includes("best") || norm.includes("max")) {
          await confirmFact(draft.id, "price_type", "best_price");
        } else {
          reply = "Quick sale or best price?";
          await saveMessage(draft.id, "out", reply, [], []);
          return { message: reply };
        }
        reply = "What's your absolute floor price? (e.g. 25 or $25)";
        nextStage = "pricing";
        await updateDraftStage(draft.id, nextStage);
      } else {
        const priceMatch = norm.match(/\$?(\d+(?:\.\d{2})?)/);
        const floor = priceMatch ? priceMatch[1] : null;
        if (floor) {
          await confirmFact(draft.id, "floor_price", floor);
          nextStage = "final_confirm";
          await updateDraftStage(draft.id, nextStage);
          const [idVal, sizeVal, condVal] = await Promise.all([
            getConfirmedFact(draft.id, "identity"),
            getConfirmedFact(draft.id, "size"),
            getConfirmedFact(draft.id, "condition"),
          ]);
          reply = `Summary: ${idVal ?? "Item"} | Size: ${sizeVal ?? "—"} | Condition: ${condVal ?? "—"} | Floor: $${floor}. List it? (yes / not yet)`;
        } else {
          reply = "What's your absolute floor price? (e.g. 25 or $25)";
        }
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "final_confirm": {
      const norm = normalizeBody(body).toLowerCase();
      if (/^(yes|yeah|yep|sure|y)$/i.test(norm)) {
        nextStage = "complete";
        await getSupabase()
          .from("listing_drafts")
          .update({
            stage: "complete",
            status: "complete",
            updated_at: now,
          })
          .eq("id", draft.id);
        reply = "You're all set. We'll be in touch.";
      } else {
        reply = "No problem — say when you're ready to list.";
      }
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "complete":
    default:
      reply = "You're all set. Text “i want to sell something” to start a new listing.";
      await saveMessage(draft.id, "out", reply, [], []);
      return { message: reply };
  }
}
