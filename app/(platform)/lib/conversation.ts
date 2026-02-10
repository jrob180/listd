/** SMS / in‑app selling flow.
 *
 * Responsibilities:
 * - Manage listing_drafts + pending prompt state
 * - Use Channel3 to ID the item from photos
 * - Walk user through: identity → variants → condition → pricing → final confirm
 * - Return plain text + structured choices for the UI
 */

import {
  getSupabase,
  type ListingDraft,
  type PendingPrompt,
} from "./supabase";
import { storeInboundMedia, registerStorageUrls } from "./storage";
import { lookupByImage } from "./channel3";
import { buildChannel3AugmentedQuery } from "./research";

export type ProcessInput = { from: string; body: string; mediaUrls: string[] };
export type ChoiceOption = { label: string; value: string; images?: string[] };
export type ProcessResult = { message: string; choices?: ChoiceOption[] };

const trim = (s: string) => s?.trim() ?? "";

const CONDITION_TAXONOMY = [
  "New with tags",
  "New without tags",
  "Used – Like New",
  "Used – Good",
  "Used – Acceptable",
] as const;

const CHOICES = {
  condition: CONDITION_TAXONOMY.map((c) => ({ label: c, value: c })),
  priceType: [
    { label: "Quick sale", value: "quick_sale" },
    { label: "Best price", value: "best_price" },
  ],
  final: [
    { label: "List it", value: "yes" },
    { label: "Not yet", value: "no" },
  ],
} as const;

const RESEARCH_TIMEOUT_MS = 20_000;

// ---------- Parsers ----------

function isTrigger(body: string): boolean {
  return trim(body).toLowerCase() === "i want to sell something";
}
function isYes(body: string): boolean {
  return /^(yes|yeah|yep|sure|correct|yup)$/.test(trim(body).toLowerCase());
}
function isNo(body: string): boolean {
  const n = trim(body).toLowerCase();
  if (/^(no|nope|nah|not really)$/.test(n)) return true;
  if (n.includes("don't have") || n.includes("dont have") || n.includes("no label") || n.includes("no tag")) {
    return true;
  }
  return false;
}
function isShowSimilar(body: string): boolean {
  const n = trim(body).toLowerCase();
  return (
    n === "show_similar" ||
    n === "show similar" ||
    n === "more options" ||
    n === "similar"
  );
}
function matchChoice(body: string, choices: string[]): string | null {
  const n = trim(body).toLowerCase();
  if (/^\d+$/.test(n)) {
    const idx = Number(n) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx] ?? null;
  }
  const found = choices.find((c) => c.toLowerCase() === n || trim(c).toLowerCase() === n);
  return found ?? null;
}
function parseCondition(body: string): string | null {
  const n = trim(body).toLowerCase();
  const map: Record<string, string> = {
    "new with tags": "New with tags",
    "new without tags": "New without tags",
    "without tags": "New without tags",
    "like new": "Used – Like New",
    "good": "Used – Good",
    "acceptable": "Used – Acceptable",
    "worn": "Used – Acceptable",
    "pretty worn": "Used – Acceptable",
  };
  for (const [k, v] of Object.entries(map)) if (n.includes(k)) return v;
  const exact = CONDITION_TAXONOMY.find((c) => c.toLowerCase() === n);
  return exact ?? null;
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

// ---------- DB helpers ----------

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
async function setStage(draftId: string, stage: string): Promise<void> {
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
async function upsertFact(
  draftId: string,
  key: string,
  value: unknown,
  confidence: number,
  source: string,
  status: "proposed" | "confirmed" | "rejected",
  evidence?: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  await getSupabase()
    .from("draft_facts")
    .upsert(
      { draft_id: draftId, key, value, confidence, source, status, evidence: evidence ?? [], updated_at: now },
      { onConflict: "draft_id,key" },
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
      { onConflict: "draft_id,key" },
    );
  }
}
async function saveMsg(
  draftId: string,
  dir: "in" | "out",
  body: string,
  twilio: string[],
  storage: string[],
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

// ---------- LLM helper for free‑text identity ----------

async function resolveIdentity(
  userInput: string,
  ctx: { proposed?: string; conversation: string },
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
            content:
              "You map the user's mention of an item to a full, specific product name suitable for a resale listing. " +
              "Include brand + model + style (e.g. 'Nike Air Force 1 Low 07'). " +
              "Only add color if the user explicitly mentions it. Return JSON { \"identity\": string }.",
          },
          {
            role: "user",
            content: JSON.stringify({
              userInput: t,
              proposedFromVision: ctx.proposed ?? null,
              conversationSummary: ctx.conversation,
            }),
          },
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

// ---------- Channel3 helpers ----------

async function storeChannel3Facts(
  draftId: string,
  c3: {
    title: string;
    brand: string;
    category: string;
    confidence: number;
    variant_options: Record<string, string[] | undefined>;
    product_url: string;
    image_urls: string[];
  },
): Promise<void> {
  await upsertFact(draftId, "channel3_confidence", c3.confidence, 1, "channel3", "proposed", []);
  await upsertFact(draftId, "identity", c3.title, c3.confidence, "channel3", "proposed", {
    product_url: c3.product_url,
    image_urls: c3.image_urls,
  });
  if (c3.brand) await upsertFact(draftId, "brand", c3.brand, c3.confidence, "channel3", "proposed", []);
  if (c3.category) await upsertFact(draftId, "category", c3.category, c3.confidence, "channel3", "proposed", []);
  await upsertFact(draftId, "variant_options", c3.variant_options, 1, "channel3", "proposed", []);
}

async function getNextVariant(
  draftId: string,
): Promise<{ key: string; label: string; choices: string[] } | null> {
  const vo = await getProposedValue(draftId, "variant_options");
  const opts = vo && typeof vo === "object" && !Array.isArray(vo) ? (vo as Record<string, string[] | undefined>) : {};
  const sizes = opts.sizes?.filter(Boolean) ?? [];
  const colors = opts.colors?.filter(Boolean) ?? [];
  const department = opts.department?.filter(Boolean) ?? [];
  const hasSize = (await getConfirmedValue(draftId, "size")) != null;
  const hasColor = (await getConfirmedValue(draftId, "color")) != null;
  const hasDept = (await getConfirmedValue(draftId, "department")) != null;
  if (sizes.length > 0 && !hasSize) return { key: "size", label: "size", choices: sizes };
  if (colors.length > 0 && !hasColor) return { key: "color", label: "color", choices: colors };
  if (department.length > 0 && !hasDept) return { key: "department", label: "department", choices: department };
  return null;
}

function getStep(draft: ListingDraft): PendingPrompt | null {
  return draft.pending ?? null;
}

async function advanceAfterIdentity(draftId: string): Promise<ProcessResult> {
  const nextVar = await getNextVariant(draftId);
  if (nextVar) {
    const reply =
      nextVar.key === "size"
        ? `It looks like this only comes in ${nextVar.choices.join(" or ")} — which is yours?`
        : `Which ${nextVar.label} is it? (${nextVar.choices.join(" / ")})`;
    await setStage(draftId, "confirm_variants");
    await setPending(draftId, {
      type: "choose_variant",
      variant_key: nextVar.key,
      choices: nextVar.choices,
    });
    return {
      message: reply,
      choices: nextVar.choices.map((c) => ({ label: c, value: c })),
    };
  }

  const condSuggested = "Used – Good";
  const reply = `I'd list the condition as '${condSuggested}'. Does that sound right?`;
  await setStage(draftId, "confirm_condition");
  await setPending(draftId, {
    type: "choose_condition",
    suggested: condSuggested,
    choices: [...CONDITION_TAXONOMY],
  });
  return { message: reply, choices: [...CHOICES.condition] };
}

async function sendChannel3BestGuess(
  draftId: string,
  c3: {
    title: string;
    brand: string;
    candidate_titles?: string[];
    candidates?: { title: string; image_urls: string[] }[];
    image_urls: string[];
  },
): Promise<ProcessResult> {
  // Build titles primarily from candidates (to preserve Channel3 ordering),
  // then fall back to candidate_titles, and de‑dupe.
  const candidateTitles = (c3.candidates ?? [])
    .map((c) => (c.title || "").trim())
    .filter(Boolean);
  const extras = c3.candidate_titles ?? [];
  const seen = new Set<string>();
  const allTitles: string[] = [];

  for (const t of [c3.title, ...candidateTitles, ...extras]) {
    const key = t.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    allTitles.push(t);
  }

  if (allTitles.length === 0) {
    const reply = "Can you send a photo of the label or tag?";
    await setPending(draftId, { type: "ask_label_photo" });
    await saveMsg(draftId, "out", reply, [], []);
    return { message: reply };
  }

  const primaryTitle = c3.title || allTitles[0];
  const primaryCandidate = c3.candidates?.find((c) => (c.title || "").trim() === primaryTitle.trim());
  const primaryImages =
    primaryCandidate?.image_urls?.length ? primaryCandidate.image_urls : c3.image_urls ?? [];

  const nameParts = [c3.brand, c3.title].filter((s) => !!s?.trim());
  const displayName = nameParts.length ? nameParts.join(" ") : c3.title || "this item";
  const reply = `This looks like a ${displayName}.\nIs this the one?`;

  const choices: ChoiceOption[] = [
    { label: "Yes, that's it", value: "yes", images: primaryImages.slice(0, 3) },
    { label: "Show similar", value: "show_similar" },
  ];

  await setPending(draftId, {
    type: "confirm_identity",
    suggested: primaryTitle,
    meta: {
      source: "channel3",
      alternatives: allTitles.filter(
        (t) => t.trim().toLowerCase() !== primaryTitle.trim().toLowerCase(),
      ),
      candidates: c3.candidates ?? [],
    },
  });
  await saveMsg(draftId, "out", reply, [], []);
  return { message: reply, choices };
}

// ---------- Main handler ----------

export async function processInboundMessage(input: ProcessInput): Promise<ProcessResult> {
  const { from, body, mediaUrls } = input;

  if (isTrigger(body)) {
    const user = await getOrCreateUser(from);
    await abandonDrafts(user.id);
    const draft = await createDraft(user.id);
    await saveMsg(draft.id, "in", body, mediaUrls, []);
    const msg = "Send at least one photo of the item to get started.";
    await saveMsg(draft.id, "out", msg, [], []);
    return { message: msg };
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

  const step = getStep(draft);
  const photoUrls = await getPhotoUrls(draft.id);

  if (!step) {
    if (draft.stage === "complete") {
      const msg = `You're all set. Text "i want to sell something" to start a new listing.`;
      await saveMsg(draft.id, "out", msg, [], []);
      return { message: msg };
    }

    if (draft.stage === "awaiting_photos") {
      if (photoUrls.length === 0 && storageUrls.length === 0) {
        const msg = "Please send at least one photo of the item.";
        await saveMsg(draft.id, "out", msg, [], []);
        return { message: msg };
      }
      const img = photoUrls[0] ?? storageUrls[0];
      if (!img) {
        const msg = "Please send at least one photo of the item.";
        await saveMsg(draft.id, "out", msg, [], []);
        return { message: msg };
      }

      await saveMsg(draft.id, "out", "One sec — identifying the item…", [], []);
      await setStage(draft.id, "researching_identity");
      const rawUserText = trim(body);
      // Build a rich description from image + user text for Channel3.
      const augmentedQuery = await buildChannel3AugmentedQuery(img, rawUserText || undefined).catch(
        () => rawUserText || undefined,
      );
      console.log("[channel3] initial lookup with augmentation", {
        draftId: draft.id,
        imageUrl: img,
        rawUserText,
        augmentedQuery: augmentedQuery ?? null,
      });
      const c3 = await Promise.race([
        lookupByImage(img, {
          limit: 9,
          query: augmentedQuery || rawUserText || undefined,
        }),
        new Promise<null>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), Math.min(RESEARCH_TIMEOUT_MS, 20_000)),
        ),
      ]).catch(() => null);
      if (c3) await storeChannel3Facts(draft.id, c3);
      await setStage(draft.id, "confirm_identity");
      if (c3) return sendChannel3BestGuess(draft.id, c3);

      const reply = "Can you send a photo of the label or tag?";
      await setPending(draft.id, { type: "ask_label_photo" });
      await saveMsg(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    const msg = "Send at least one photo of the item to get started.";
    await saveMsg(draft.id, "out", msg, [], []);
    return { message: msg };
  }

  switch (step.type) {
    case "confirm_identity": {
      const suggested = step.suggested || "item";
      const meta = (step as any).meta ?? {};
      const source = meta.source as string | undefined;
      const alternatives: string[] = Array.isArray(meta.alternatives) ? meta.alternatives : [];
      const candidatesMeta =
        Array.isArray(meta.candidates) && meta.candidates.length
          ? (meta.candidates as { title: string; image_urls: string[] }[])
          : [];

      // Channel3 "Show similar" → browse_alternatives using candidates when possible.
      if (isShowSimilar(body)) {
        const candidateTitles = candidatesMeta
          .map((c) => (c.title || "").trim())
          .filter(Boolean);
        const sourceTitles = candidateTitles.length > 0 ? candidateTitles : alternatives;

        const seenTitles = new Set<string>();
        const suggestedKey = suggested.trim().toLowerCase();
        const browseTitles: string[] = [];

        for (const t of sourceTitles) {
          const key = t.trim().toLowerCase();
          if (!key || seenTitles.has(key)) continue;
          if (key === suggestedKey) continue; // don't repeat hero candidate
          const cand = candidatesMeta.find(
            (c) => (c.title || "").trim().toLowerCase() === key,
          );
          if (!cand || !cand.image_urls || cand.image_urls.length === 0) continue; // skip candidates with no images
          seenTitles.add(key);
          browseTitles.push(t);
        }

        // If we have at least one candidate with images, enter browsing mode.
        if (browseTitles.length > 0) {
          const index = 0;
          const firstTitle = browseTitles[0];
          const cand =
            candidatesMeta.find(
              (c) => (c.title || "").trim().toLowerCase() === firstTitle.trim().toLowerCase(),
            ) ?? candidatesMeta[0];
          const imgs = cand?.image_urls?.length ? cand.image_urls : [];
          const reply = "Here’s another close match.\nDoes this look right?";
          const choices: ChoiceOption[] = [
            { label: "This is mine", value: "this_is_mine", images: imgs.slice(0, 3) },
            { label: "Next", value: "next" },
            { label: "None of these", value: "none" },
          ];
          await setPending(draft.id, {
            type: "browse_alternatives",
            choices: browseTitles,
            meta: { index, source: "channel3", candidates: candidatesMeta },
          });
          await saveMsg(draft.id, "out", reply, [], []);
          return { message: reply, choices };
        }

        // No candidates with valid images → escalate to tag photo immediately.
        const reply = "Got it — a quick photo of the inside tag would help me nail it.";
        await setPending(draft.id, { type: "ask_label_photo" });
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }

      if (isNo(body)) {
        const reply = "Can you send a photo of the label or tag? Or tell me what you'd call this item.";
        await setPending(draft.id, { type: "ask_label_photo" });
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }

      if (isYes(body)) {
        await confirmFact(draft.id, "identity", suggested);
        return advanceAfterIdentity(draft.id);
      }

      const resolved = await resolveIdentity(trim(body), {
        proposed: suggested,
        conversation: (await getRecentMessages(draft.id, 12))
          .reverse()
          .map((m) => `${m.direction}: ${m.body}`)
          .join("\n"),
      });
      if (resolved) {
        await confirmFact(draft.id, "identity", resolved);
        return advanceAfterIdentity(draft.id);
      }

      const fallback = "Can you send a photo of the label or tag? Or tell me what you'd call this item.";
      await setPending(draft.id, { type: "ask_label_photo" });
      await saveMsg(draft.id, "out", fallback, [], []);
      return { message: fallback };
    }

    case "browse_alternatives": {
      const titles = step.choices;
      const meta = (step.meta ?? {}) as {
        index?: number;
        source?: string;
        candidates?: { title: string; image_urls: string[] }[];
      };
      const index = typeof meta.index === "number" ? meta.index : 0;
      const candidatesMeta = Array.isArray(meta.candidates) ? meta.candidates : [];

      const n = trim(body).toLowerCase();
      const isThisMine = n === "this is mine" || n === "this_is_mine";
      const isNext = n === "next";
      const isNone = n === "none of these" || n === "none";

      if (isThisMine) {
        const current = titles[index] ?? titles[0];
        await confirmFact(draft.id, "identity", current);
        return advanceAfterIdentity(draft.id);
      }

      if (isNext) {
        // Move to the next candidate that actually has images; skip ones without.
        let nextIndex = index + 1;
        while (nextIndex < titles.length) {
          const title = titles[nextIndex];
          const cand = candidatesMeta.find(
            (c) => (c.title || "").trim().toLowerCase() === title.trim().toLowerCase(),
          );
          if (cand && cand.image_urls && cand.image_urls.length > 0) {
            const imgs = cand.image_urls;
            const reply = "Here’s another close match.\nDoes this look right?";
            const choices: ChoiceOption[] = [
              { label: "This is mine", value: "this_is_mine", images: imgs.slice(0, 3) },
              { label: "Next", value: "next" },
              { label: "None of these", value: "none" },
            ];
            await setPending(draft.id, {
              type: "browse_alternatives",
              choices: titles,
              meta: { index: nextIndex, source: meta.source, candidates: candidatesMeta },
            });
            await saveMsg(draft.id, "out", reply, [], []);
            return { message: reply, choices };
          }
          nextIndex += 1;
        }
        const reply = "Got it — a quick photo of the inside tag would help me nail it.";
        await setPending(draft.id, { type: "ask_label_photo" });
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }

      if (isNone) {
        const reply = "Got it — a quick photo of the inside tag would help me nail it.";
        await setPending(draft.id, { type: "ask_label_photo" });
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }

      const title = titles[index] ?? titles[0];
      const cand = candidatesMeta.find(
        (c) => (c.title || "").trim().toLowerCase() === title.trim().toLowerCase(),
      );
      const imgs = cand?.image_urls?.length ? cand.image_urls : [];
      if (!cand || imgs.length === 0) {
        const reply = "Got it — a quick photo of the inside tag would help me nail it.";
        await setPending(draft.id, { type: "ask_label_photo" });
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }
      const reply = "Tap one of the options below so I can keep going.";
      const choices: ChoiceOption[] = [
        { label: "This is mine", value: "this_is_mine", images: imgs.slice(0, 3) },
        { label: "Next", value: "next" },
        { label: "None of these", value: "none" },
      ];
      await setPending(draft.id, {
        type: "browse_alternatives",
        choices: titles,
        meta: { index, source: meta.source, candidates: candidatesMeta },
      });
      await saveMsg(draft.id, "out", reply, [], []);
      return { message: reply, choices };
    }

    case "ask_label_photo": {
      if (isNo(body)) {
        const reply = "Got it — what would you call this item? (e.g. Nike Air Max 270)";
        await setPending(draft.id, { type: "confirm_identity", suggested: "item" });
        await saveMsg(draft.id, "out", reply, [], []);
        return { message: reply };
      }

      if (storageUrls.length > 0) {
        const img = storageUrls[0];
        await saveMsg(draft.id, "out", "One sec — identifying the item…", [], []);
        const rawUserText = trim(body);
        const augmentedQuery = await buildChannel3AugmentedQuery(
          img,
          rawUserText || undefined,
        ).catch(() => rawUserText || undefined);
        console.log("[channel3] tag/label lookup with augmentation", {
          draftId: draft.id,
          imageUrl: img,
          rawUserText,
          augmentedQuery: augmentedQuery ?? null,
        });
        const c3 = await Promise.race([
          lookupByImage(img, {
            limit: 9,
            query: augmentedQuery || rawUserText || undefined,
          }),
          new Promise<null>((_, rej) =>
            setTimeout(() => rej(new Error("timeout")), RESEARCH_TIMEOUT_MS),
          ),
        ]).catch(() => null);
        if (c3) await storeChannel3Facts(draft.id, c3);
        if (c3) return sendChannel3BestGuess(draft.id, c3);
        const replyLow = "Can you send a photo of the label or tag?";
        await setPending(draft.id, { type: "ask_label_photo" });
        await saveMsg(draft.id, "out", replyLow, [], []);
        return { message: replyLow };
      }

      if (trim(body).length >= 2) {
        const resolved = await resolveIdentity(trim(body), {
          conversation: (await getRecentMessages(draft.id, 12))
            .reverse()
            .map((m) => `${m.direction}: ${m.body}`)
            .join("\n"),
        });
        await confirmFact(draft.id, "identity", resolved);
        return advanceAfterIdentity(draft.id);
      }

      const reply = "Can you send a photo of the label or tag? Or tell me what you'd call this item.";
      await setPending(draft.id, { type: "ask_label_photo" });
      await saveMsg(draft.id, "out", reply, [], []);
      return { message: reply };
    }

    case "choose_variant": {
      const picked = matchChoice(body, step.choices);
      if (!picked) {
        const reply =
          step.variant_key === "size"
            ? `It looks like this only comes in ${step.choices.join(" or ")} — which is yours?`
            : `Which ${step.variant_key} is it? (${step.choices.join(" / ")})`;
        await setPending(draft.id, {
          type: "choose_variant",
          variant_key: step.variant_key,
          choices: step.choices,
        });
        await saveMsg(draft.id, "out", reply, [], []);
        return {
          message: reply,
          choices: step.choices.map((c) => ({ label: c, value: c })),
        };
      }
      await confirmFact(draft.id, step.variant_key, picked);
      return advanceAfterIdentity(draft.id);
    }

    case "choose_condition": {
      const suggested = step.suggested ?? "Used – Good";
      const choices = step.choices ?? [...CONDITION_TAXONOMY];

      if (isYes(body) && suggested) {
        await confirmFact(draft.id, "condition", suggested);
      } else {
        const cond = parseCondition(body);
        if (cond) {
          await confirmFact(draft.id, "condition", cond);
        } else if (isNo(body)) {
          const reply =
            "Which condition? (New with tags / New without tags / Used – Like New / Used – Good / Used – Acceptable)";
          await setPending(draft.id, { type: "choose_condition", suggested, choices });
          await saveMsg(draft.id, "out", reply, [], []);
          return { message: reply, choices: [...CHOICES.condition] };
        } else {
          const reply =
            "Which condition? (New with tags / New without tags / Used – Like New / Used – Good / Used – Acceptable)";
          await setPending(draft.id, { type: "choose_condition", suggested, choices });
          await saveMsg(draft.id, "out", reply, [], []);
          return { message: reply, choices: [...CHOICES.condition] };
        }
      }

      await setStage(draft.id, "pricing");
      await setPending(draft.id, { type: "pricing", step: "price_type" });
      const msg = "Quick sale or best price?";
      await saveMsg(draft.id, "out", msg, [], []);
      return { message: msg, choices: [...CHOICES.priceType] };
    }

    case "pricing": {
      if (step.step === "price_type") {
        const pt = parsePriceType(body);
        if (!pt) {
          await setPending(draft.id, { type: "pricing", step: "price_type" });
          const msg = "Quick sale or best price?";
          await saveMsg(draft.id, "out", msg, [], []);
          return { message: msg, choices: [...CHOICES.priceType] };
        }
        await confirmFact(draft.id, "price_type", pt);
        await setPending(draft.id, { type: "pricing", step: "floor_price" });
        const msg = "What's your absolute floor price?";
        await saveMsg(draft.id, "out", msg, [], []);
        return { message: msg };
      }

      const floor = parseFloorPrice(body);
      if (!floor) {
        await setPending(draft.id, { type: "pricing", step: "floor_price" });
        const msg = "What's your absolute floor price?";
        await saveMsg(draft.id, "out", msg, [], []);
        return { message: msg };
      }

      await confirmFact(draft.id, "floor_price", floor);
      await setStage(draft.id, "final_confirm");

      const id = await getConfirmedValue(draft.id, "identity");
      const brand = await getConfirmedValue(draft.id, "brand");
      const size = await getConfirmedValue(draft.id, "size");
      const color = await getConfirmedValue(draft.id, "color");
      const cond = await getConfirmedValue(draft.id, "condition");
      const defects = await getConfirmedValue(draft.id, "defects");
      const priceType = await getConfirmedValue(draft.id, "price_type");

      const summary =
        `Summary: ${id ?? "Item"}${brand ? ` | Brand: ${brand}` : ""} | Size: ${size ?? "—"} | Color: ${
          color ?? "—"
        } | Condition: ${cond ?? "—"}${
          defects ? ` | Defects: ${defects}` : ""
        } | ${priceType === "quick_sale" ? "Quick sale" : "Best price"} | Floor: $${floor}.` +
        "\n\nWant me to list this now?";

      await setPending(draft.id, { type: "final_confirm", summary });
      await saveMsg(draft.id, "out", summary, [], []);
      return { message: summary, choices: [...CHOICES.final] };
    }

    case "final_confirm": {
      const ok = parseFinal(body);
      if (ok === true) {
        await getSupabase()
          .from("listing_drafts")
          .update({
            stage: "complete",
            status: "complete",
            pending: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);
        const msg = "You're all set. We'll be in touch.";
        await saveMsg(draft.id, "out", msg, [], []);
        return { message: msg };
      }
      const msg = "No problem — say when you're ready to list.";
      await saveMsg(draft.id, "out", msg, [], []);
      return { message: msg };
    }
  }

  const msg = "Send at least one photo of the item to get started.";
  await saveMsg(draft.id, "out", msg, [], []);
  return { message: msg };
}