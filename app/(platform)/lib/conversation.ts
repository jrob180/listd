/**
 * Listing intake: one step at a time. Pending = what we're asking.
 * Buttons when we need a fixed choice; LLM when we need to infer (identity, condition).
 */

import {
  getSupabase,
  type ListingDraft,
  type DraftFact,
  type PendingPrompt,
} from "./supabase";
import { storeInboundMedia, registerStorageUrls } from "./storage";
import { runResearch, runEbaySearch, type VisionResult, type EbayItemSummary } from "./research";

// --- Types ---
export type ProcessInput = { from: string; body: string; mediaUrls: string[] };
export type ChoiceOption = { label: string; value: string };
export type ProcessResult = { message: string; choices?: ChoiceOption[] };

const trim = (s: string) => s?.trim() ?? "";

// --- Choice sets (for UI buttons) ---
const CHOICES = {
  identity: [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ],
  condition: [
    { label: "New with tags", value: "New with tags" },
    { label: "Used – Like New", value: "Used – Like New" },
    { label: "Used – Good", value: "Used – Good" },
    { label: "Used – Acceptable", value: "Used – Acceptable" },
  ],
  priceType: [
    { label: "Quick sale", value: "quick_sale" },
    { label: "Best price", value: "best_price" },
  ],
  final: [
    { label: "List it", value: "yes" },
    { label: "Not yet", value: "no" },
  ],
} as const;

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

// --- Parsers (deterministic, no LLM) ---
function isTrigger(body: string): boolean {
  const n = trim(body).toLowerCase();
  return n === "i want to sell something" || (n.includes("want") && n.includes("sell"));
}
function isYes(body: string): boolean {
  return /^(yes|yeah|yep|sure|correct|yup)$/.test(trim(body).toLowerCase());
}
function isNo(body: string): boolean {
  return /^(no|nope|nah|not really)$/.test(trim(body).toLowerCase());
}
function parseSize(body: string): string | null {
  const n = trim(body);
  return n.length >= 1 ? n : null;
}
function parseCondition(body: string): string | null {
  const n = trim(body).toLowerCase();
  const map: Record<string, string> = {
    "new with tags": "New with tags",
    "like new": "Used – Like New",
    "good": "Used – Good",
    "acceptable": "Used – Acceptable",
  };
  for (const [k, v] of Object.entries(map)) if (n.includes(k)) return v;
  return null;
}
function parsePriceType(body: string): "quick_sale" | "best_price" | null {
  const n = trim(body).toLowerCase();
  if (/quick|fast/.test(n)) return "quick_sale";
  if (/best|max/.test(n)) return "best_price";
  return null;
}
function parseFloorPrice(body: string): string | null {
  const m = trim(body).match(/\$?(\d+(?:\.\d{2})?)/);
  return m ? m[1] : null;
}
function parseFinal(body: string): boolean | null {
  const n = trim(body).toLowerCase();
  if (/^(yes|yeah|list|do it)$/.test(n)) return true;
  if (/^(no|nope|not yet)$/.test(n)) return false;
  return null;
}

// --- DB ---
async function getOrCreateUser(phone: string): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data: u } = await sb.from("sms_users").select("id").eq("phone_number", phone).single();
  if (u) return { id: u.id };
  const { data: ins, error } = await sb.from("sms_users").insert({ phone_number: phone }).select("id").single();
  if (error) throw new Error("Failed to create user");
  return { id: ins!.id };
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
    .insert({ user_id: userId, status: "active", stage: "awaiting_photos" })
    .select()
    .single();
  if (error) throw new Error("Failed to create draft");
  return data as ListingDraft;
}

async function abandonDrafts(userId: string): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active");
}

async function setStage(draftId: string, stage: Stage): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", draftId);
}

export async function setPending(draftId: string, p: PendingPrompt): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ pending: p, updated_at: new Date().toISOString() })
    .eq("id", draftId);
}

export async function clearPending(draftId: string): Promise<void> {
  await getSupabase()
    .from("listing_drafts")
    .update({ pending: null, updated_at: new Date().toISOString() })
    .eq("id", draftId);
}

export async function getConfirmedValue(draftId: string, key: string): Promise<unknown> {
  const { data } = await getSupabase()
    .from("draft_facts")
    .select("value")
    .eq("draft_id", draftId)
    .eq("key", key)
    .eq("status", "confirmed")
    .maybeSingle();
  return (data as { value: unknown } | null)?.value ?? null;
}

export async function getProposedValue(draftId: string, key: string): Promise<unknown> {
  const { data } = await getSupabase()
    .from("draft_facts")
    .select("value")
    .eq("draft_id", draftId)
    .eq("key", key)
    .eq("status", "proposed")
    .maybeSingle();
  return (data as { value: unknown } | null)?.value ?? null;
}

async function getFacts(draftId: string): Promise<DraftFact[]> {
  const { data } = await getSupabase().from("draft_facts").select("*").eq("draft_id", draftId);
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
      { draft_id: draftId, key, value, confidence, source, status, evidence: evidence ?? [], updated_at: now },
      { onConflict: "draft_id,key" }
    );
}

async function confirmFact(draftId: string, key: string, value: unknown): Promise<void> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data } = await sb
    .from("draft_facts")
    .update({ value, status: "confirmed", updated_at: now })
    .eq("draft_id", draftId)
    .eq("key", key)
    .select("id");
  if (!data?.length) {
    await sb.from("draft_facts").upsert(
      { draft_id: draftId, key, value, confidence: 1, source: "user", status: "confirmed", evidence: [], updated_at: now },
      { onConflict: "draft_id,key" }
    );
  }
}

async function saveMsg(
  draftId: string,
  dir: "in" | "out",
  body: string,
  twilio: string[],
  storage: string[]
): Promise<void> {
  await getSupabase().from("draft_messages").insert({
    draft_id: draftId,
    direction: dir,
    body,
    twilio_media_urls: twilio,
    storage_media_urls: storage,
  });
}

async function getPhotoUrls(draftId: string): Promise<string[]> {
  const { data } = await getSupabase()
    .from("draft_photos")
    .select("storage_url")
    .eq("draft_id", draftId)
    .eq("kind", "user")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r: { storage_url: string }) => r.storage_url);
}

async function getRecentMessages(draftId: string, limit: number): Promise<{ direction: string; body: string }[]> {
  const { data } = await getSupabase()
    .from("draft_messages")
    .select("direction, body")
    .eq("draft_id", draftId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as { direction: string; body: string }[];
}

// --- LLM: research extraction ---
async function runExtraction(
  vision: VisionResult | null,
  ebay: EbayItemSummary[],
  facts: DraftFact[],
  userMsg: string
): Promise<{ proposedFacts?: Array<{ key: string; value: unknown; confidence: number; source: string; evidence?: string[] }> }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return {};
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `Extract listing facts from vision + eBay + user message. Output JSON: { "proposedFacts": [ { "key", "value", "confidence", "source", "evidence" } ] }. Keys: identity, size, condition (eBay terms). Use "New with tags", "Used – Like New", "Used – Good", "Used – Acceptable".`,
          },
          {
            role: "user",
            content: JSON.stringify({
              vision: vision ? { inferredItem: vision.inferredItem, searchQuery: vision.searchQuery } : null,
              ebay: ebay.slice(0, 15).map((i) => ({ title: i.title, condition: i.condition })),
              facts: facts.map((f) => ({ key: f.key, value: f.value, status: f.status })),
              user_message: userMsg,
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return {};
    const raw = (await res.json()).choices?.[0]?.message?.content;
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// --- LLM: resolve to full, specific product name ---
async function resolveIdentity(
  userInput: string,
  ctx: { proposed?: string; conversation: string }
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  const t = trim(userInput);
  if (!t || !key) return t;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `You resolve the user's product mention to the full, specific official product name for a listing.

Input: userInput (e.g. "these are air force 1s", "air force ones", "jordan 1 lows"), optional proposedFromVision (what we guessed from a photo), and conversationSummary.

Output JSON: { "identity": "full specific product name" }

Rules:
- Include brand + model + style/silhouette when relevant (e.g. "Nike Air Force 1 Low '07", "Nike Air Jordan 1 Retro High OG", "Nike Dunk Low").
- Use official or widely recognized names. For sneakers include Low/Mid/High if it's standard (e.g. Air Force 1 Low, Air Jordan 1 High).
- Don't add color or condition unless the user specified it; keep it to the product line and style.
- Be specific enough to be useful for a listing (e.g. "Nike Air Force 1 '07" not just "Nike Air Force 1").`,
          },
          { role: "user", content: JSON.stringify({ userInput: t, proposedFromVision: ctx.proposed ?? null, conversationSummary: ctx.conversation }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return t;
    const raw = (await res.json()).choices?.[0]?.message?.content;
    const out = typeof raw === "string" ? JSON.parse(raw) : {};
    return (out.identity ?? t).trim() || t;
  } catch {
    return t;
  }
}

// --- Generate listing description from product name + eBay similar listings ---
async function generateDescription(draftId: string, productName: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !productName) return "";

  const { results } = await runEbaySearch(productName.slice(0, 80), draftId);
  const snippets = results.slice(0, 15).map((i) => ({ title: i.title ?? "", condition: i.condition ?? "" }));

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You write a short, compelling product description for a resale listing.

Input: productName (exact product we're listing) and similarListings (titles/conditions from eBay or similar).

Output JSON: { "description": "2-4 sentences" }

Rules:
- Sound like a clear, honest listing (not marketing fluff). Mention the exact product name and 1-2 key details (e.g. style, materials, condition range).
- Use similar listings only for tone and common details; don't copy. If no listings provided, use the product name and general knowledge.
- Keep it under 4 sentences. No hashtags.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              productName,
              similarListings: snippets,
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return "";
    const raw = (await res.json()).choices?.[0]?.message?.content;
    const out = typeof raw === "string" ? JSON.parse(raw) : {};
    const desc = (out.description ?? "").trim();
    return desc || "";
  } catch {
    return "";
  }
}

// --- Step: what we're asking (pending or inferred from stage) ---
type Step =
  | PendingPrompt
  | { type: "confirm_identity"; proposedIdentity: string }
  | { type: "confirm_size" }
  | { type: "choose_condition"; suggested?: string }
  | { type: "price_type" }
  | { type: "floor_price" }
  | { type: "final_confirm"; summary: string };

async function getStep(draft: ListingDraft): Promise<Step | null> {
  const p = draft.pending ?? null;
  if (p) return p;
  const stage = draft.stage as Stage;
  if (stage === "confirm_identity") {
    const v = (await getProposedValue(draft.id, "identity")) ?? (await getConfirmedValue(draft.id, "identity"));
    const proposed = typeof v === "string" ? v : v != null ? String(v) : "item";
    return { type: "confirm_identity", proposedIdentity: proposed };
  }
  if (stage === "confirm_size") return { type: "confirm_size" };
  if (stage === "confirm_condition") {
    const v = await getProposedValue(draft.id, "condition");
    const suggested = typeof v === "string" ? v : "Used – Good";
    return { type: "choose_condition", suggested };
  }
  if (stage === "pricing") {
    const has = (await getConfirmedValue(draft.id, "price_type")) != null;
    return has ? { type: "floor_price" } : { type: "price_type" };
  }
  if (stage === "final_confirm") {
    const id = await getConfirmedValue(draft.id, "identity");
    const size = await getConfirmedValue(draft.id, "size");
    const cond = await getConfirmedValue(draft.id, "condition");
    const floor = await getConfirmedValue(draft.id, "floor_price");
    const desc = (await getProposedValue(draft.id, "description")) ?? (await getConfirmedValue(draft.id, "description"));
    const descStr = typeof desc === "string" && desc.trim() ? desc.trim() : null;
    const summary =
      `Summary: ${id ?? "Item"} | Size: ${size ?? "—"} | Condition: ${cond ?? "—"} | Floor: $${floor ?? "—"}.` +
      (descStr ? `\n\nDescription: ${descStr}` : "") +
      "\n\nList it?";
    return { type: "final_confirm", summary };
  }
  return null;
}

// --- Main handler ---
export async function processInboundMessage(input: ProcessInput): Promise<ProcessResult> {
  const { from, body, mediaUrls } = input;

  if (isTrigger(body)) {
    const user = await getOrCreateUser(from);
    await abandonDrafts(user.id);
    const draft = await createDraft(user.id);
    await saveMsg(draft.id, "in", body, mediaUrls, []);
    await saveMsg(draft.id, "out", "Send at least one photo of the item to get started.", [], []);
    return { message: "Send at least one photo of the item to get started." };
  }

  const user = await getOrCreateUser(from);
  let draft = await getActiveDraft(user.id);
  if (!draft) draft = await createDraft(user.id);

  const isApp = mediaUrls.some((u) => typeof u === "string" && u.includes("supabase"));
  const storageUrls =
    mediaUrls.length > 0
      ? isApp
        ? await registerStorageUrls(mediaUrls, draft.id)
        : await storeInboundMedia(mediaUrls, draft.id)
      : [];
  await saveMsg(draft.id, "in", body, mediaUrls, storageUrls);

  const step = await getStep(draft);
  const photoUrls = await getPhotoUrls(draft.id);

  if (!step) {
    if (draft.stage === "complete") {
      await saveMsg(draft.id, "out", 'You\'re all set. Text "i want to sell something" to start a new listing.', [], []);
      return { message: 'You\'re all set. Text "i want to sell something" to start a new listing.' };
    }
    if (draft.stage === "awaiting_photos") {
      if (photoUrls.length === 0 && storageUrls.length === 0) {
        await saveMsg(draft.id, "out", "Please send at least one photo of the item.", [], []);
        return { message: "Please send at least one photo of the item." };
      }
      const img = photoUrls[0] || storageUrls[0];
      if (!img) {
        await saveMsg(draft.id, "out", "Please send at least one photo of the item.", [], []);
        return { message: "Please send at least one photo of the item." };
      }
      await saveMsg(draft.id, "out", "Working…", [], []);
      await setStage(draft.id, "researching_identity");
      const research = await runResearch(draft.id, img, null);
      const facts = await getFacts(draft.id);
      const out = await runExtraction(research.vision, research.ebay ?? [], facts, body);
      for (const f of out.proposedFacts ?? []) {
        await upsertFact(draft.id, f.key, f.value, f.confidence, f.source, "proposed", f.evidence);
      }
      const proposedId =
        out.proposedFacts?.find((x) => x.key === "identity")?.value ?? research.vision?.inferredItem;
      const proposedStr = proposedId != null ? String(proposedId) : "";
      const lowConf =
        (out.proposedFacts?.find((x) => x.key === "identity")?.confidence ?? 0) < 0.6 ||
        research.visionStatus !== "success";
      await setStage(draft.id, "confirm_identity");
      let reply: string;
      let choices: ChoiceOption[] | undefined;
      if (lowConf) {
        reply = "I couldn't identify this well. Send a photo of the label or tell me what you'd call it.";
        await setPending(draft.id, { type: "confirm_identity", proposedIdentity: proposedStr || "item" });
      } else if (proposedStr && proposedStr !== "item") {
        reply = `Is this a ${proposedStr}?`;
        await setPending(draft.id, { type: "confirm_identity", proposedIdentity: proposedStr });
        choices = [...CHOICES.identity];
      } else {
        reply = "What would you call this item? (e.g. Air Jordan 1 Lows)";
        await setPending(draft.id, { type: "confirm_identity", proposedIdentity: "item" });
      }
      await saveMsg(draft.id, "out", reply, [], []);
      return { message: reply, choices };
    }
    await saveMsg(draft.id, "out", "Send at least one photo of the item to get started.", [], []);
    return { message: "Send at least one photo of the item to get started." };
  }

  await clearPending(draft.id);

  switch (step.type) {
    case "confirm_identity": {
      const proposed = step.proposedIdentity || "item";
      if (isNo(body)) {
        const reply = "Can you send a photo of the label or tag? Or tell me what you'd call this item.";
        await setPending(draft.id, { type: "confirm_identity", proposedIdentity: proposed });
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }
      if (isYes(body)) {
        await confirmFact(draft.id, "identity", proposed);
        const desc = await generateDescription(draft.id, proposed);
        if (desc) await upsertFact(draft.id, "description", desc, 0.8, "generated", "proposed", []);
        await setStage(draft.id, "confirm_size");
        await setPending(draft.id, { type: "confirm_size" });
        const reply = desc
          ? `Awesome, classifying as ${proposed}. I've drafted a description from similar listings. What size is it?`
          : "What size is it?";
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }
      const recent = (await getRecentMessages(draft.id, 12)).reverse().map((m) => `${m.direction}: ${m.body}`).join("\n");
      const resolved = await resolveIdentity(trim(body), { proposed, conversation: recent });
      if (resolved.length >= 2) {
        await confirmFact(draft.id, "identity", resolved);
        const desc = await generateDescription(draft.id, resolved);
        if (desc) await upsertFact(draft.id, "description", desc, 0.8, "generated", "proposed", []);
        await setStage(draft.id, "confirm_size");
        await setPending(draft.id, { type: "confirm_size" });
        const reply = desc
          ? `Awesome, classifying the product as ${resolved}. I've drafted a description from similar listings. What size is it?`
          : `Awesome, classifying the product as ${resolved}. What size is it?`;
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }
      const reply2 = "What would you call this item? (e.g. Air Jordan 1 Lows)";
      await setPending(draft.id, { type: "confirm_identity", proposedIdentity: proposed });
      await saveMsg(draft.id, "out", reply2, [], []);
      return { message: reply2 };
    }

    case "confirm_size": {
      const size = parseSize(body);
      if (!size) {
        await setPending(draft.id, { type: "confirm_size" });
        await saveMsg(draft.id, "out", "What size is it?", [], []);
        return { message: "What size is it?" };
      }
      await confirmFact(draft.id, "size", size);
      await setStage(draft.id, "confirm_condition");
      const cond = (await getProposedValue(draft.id, "condition")) ?? "Used – Good";
      const condStr = typeof cond === "string" ? cond : "Used – Good";
      const reply = `I'd list the condition as '${condStr}'. Does that sound right?`;
      await setPending(draft.id, { type: "choose_condition", suggested: condStr });
      await saveMsg(draft.id, "out", reply, [], []);
      return { message: reply, choices: [...CHOICES.condition] };
    }

    case "choose_condition": {
      const suggested = step.suggested ?? "Used – Good";
      if (isYes(body) && suggested) {
        await confirmFact(draft.id, "condition", suggested);
        await setStage(draft.id, "pricing");
        await setPending(draft.id, { type: "price_type" });
        await saveMsg(draft.id, "out", "Quick sale or best price?", [], []);
        return { message: "Quick sale or best price?", choices: [...CHOICES.priceType] };
      }
      const cond = parseCondition(body);
      if (cond) {
        await confirmFact(draft.id, "condition", cond);
        await setStage(draft.id, "pricing");
        await setPending(draft.id, { type: "price_type" });
        await saveMsg(draft.id, "out", "Quick sale or best price?", [], []);
        return { message: "Quick sale or best price?", choices: [...CHOICES.priceType] };
      }
      const reply = "What condition? (New with tags / Used – Like New / Used – Good / Used – Acceptable)";
      await setPending(draft.id, { type: "choose_condition", suggested });
      await saveMsg(draft.id, "out", reply, [], []);
      return { message: reply, choices: [...CHOICES.condition] };
    }

    case "price_type": {
      const pt = parsePriceType(body);
      if (!pt) {
        await setPending(draft.id, { type: "price_type" });
        await saveMsg(draft.id, "out", "Quick sale or best price?", [], []);
        return { message: "Quick sale or best price?", choices: [...CHOICES.priceType] };
      }
      await confirmFact(draft.id, "price_type", pt);
      await setPending(draft.id, { type: "floor_price" });
      await saveMsg(draft.id, "out", "What's your absolute floor price? (e.g. 25 or $25)", [], []);
      return { message: "What's your absolute floor price? (e.g. 25 or $25)" };
    }

    case "floor_price": {
      const floor = parseFloorPrice(body);
      if (!floor) {
        await setPending(draft.id, { type: "floor_price" });
        await saveMsg(draft.id, "out", "What's your absolute floor price? (e.g. 25 or $25)", [], []);
        return { message: "What's your absolute floor price? (e.g. 25 or $25)" };
      }
      await confirmFact(draft.id, "floor_price", floor);
      await setStage(draft.id, "final_confirm");
      const id = await getConfirmedValue(draft.id, "identity");
      const size = await getConfirmedValue(draft.id, "size");
      const cond = await getConfirmedValue(draft.id, "condition");
      const desc = (await getProposedValue(draft.id, "description")) ?? (await getConfirmedValue(draft.id, "description"));
      const descStr = typeof desc === "string" && desc.trim() ? desc.trim() : null;
      const summary =
        `Summary: ${id ?? "Item"} | Size: ${size ?? "—"} | Condition: ${cond ?? "—"} | Floor: $${floor}.` +
        (descStr ? `\n\nDescription: ${descStr}` : "") +
        "\n\nList it?";
      await setPending(draft.id, { type: "final_confirm", summary });
      await saveMsg(draft.id, "out", summary, [], []);
      return { message: summary, choices: [...CHOICES.final] };
    }

    case "final_confirm": {
      const ok = parseFinal(body);
      if (ok === true) {
        await getSupabase()
          .from("listing_drafts")
          .update({ stage: "complete", status: "complete", pending: null, updated_at: new Date().toISOString() })
          .eq("id", draft.id);
        await saveMsg(draft.id, "out", "You're all set. We'll be in touch.", [], []);
        return { message: "You're all set. We'll be in touch." };
      }
      await saveMsg(draft.id, "out", "No problem — say when you're ready to list.", [], []);
      return { message: "No problem — say when you're ready to list." };
    }
  }
}
