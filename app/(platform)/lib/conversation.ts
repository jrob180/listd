/**
 * Minimal intake: Gemini identifies the item from photos; user confirms.
 * Later we'll use the phrase for eBay search and listing creation.
 */

import { getSupabase } from "./supabase";
import { identifyItem } from "./gemini";

export type ProcessInput = { from: string; body: string; mediaUrls: string[] };
export type ProcessResult = { message: string; choices?: { label: string; value: string }[] };

const trim = (s: string) => s?.trim() ?? "";

function isTrigger(body: string): boolean {
  return trim(body).toLowerCase() === "i want to sell something";
}
function isYes(body: string): boolean {
  return /^(yes|yeah|yep|sure|correct|yup)$/.test(trim(body).toLowerCase());
}
function isNo(body: string): boolean {
  return /^(no|nope|nah)$/.test(trim(body).toLowerCase());
}

async function getOrCreateUser(from: string): Promise<{ id: string }> {
  const sb = getSupabase();
  const { data: u } = await sb.from("sms_users").select("id").eq("phone_number", from).single();
  if (u) return { id: u.id };
  const { data: ins, error } = await sb.from("sms_users").insert({ phone_number: from }).select("id").single();
  if (error) throw new Error("Failed to create user");
  return { id: ins!.id };
}

async function getActiveDraft(userId: string): Promise<{ id: string; stage: string; pending: unknown } | null> {
  const { data } = await getSupabase()
    .from("listing_drafts")
    .select("id, stage, pending")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  return data as { id: string; stage: string; pending: unknown } | null;
}

async function createDraft(userId: string): Promise<{ id: string; stage: string; pending: unknown }> {
  const { data, error } = await getSupabase()
    .from("listing_drafts")
    .insert({ user_id: userId, status: "active", stage: "awaiting_photos" })
    .select("id, stage, pending")
    .single();
  if (error) throw new Error("Failed to create draft");
  return data as { id: string; stage: string; pending: unknown };
}

async function setStage(draftId: string, stage: string, pending?: unknown): Promise<void> {
  const payload: { stage: string; updated_at: string; pending?: unknown } = {
    stage,
    updated_at: new Date().toISOString(),
  };
  if (pending !== undefined) payload.pending = pending;
  await getSupabase().from("listing_drafts").update(payload).eq("id", draftId);
}

export async function processInboundMessage(input: ProcessInput): Promise<ProcessResult> {
  const { from, body, mediaUrls } = input;

  if (isTrigger(body)) {
    const user = await getOrCreateUser(from);
    await getSupabase()
      .from("listing_drafts")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "active");
    await createDraft(user.id);
    return { message: "Send at least one photo of the item to get started." };
  }

  const user = await getOrCreateUser(from);
  let draft = await getActiveDraft(user.id);
  if (!draft) draft = await createDraft(user.id);

  const photoUrls = mediaUrls.filter((u) => typeof u === "string" && u.trim().length > 0);

  if (draft.stage === "awaiting_photos") {
    if (photoUrls.length === 0) {
      return { message: "Please send at least one photo of the item." };
    }
    await setStage(draft.id, "researching_identity");
    const phrase = await identifyItem(photoUrls, body || undefined);
    if (!phrase || phrase.trim().length === 0) {
      await setStage(draft.id, "awaiting_photos", null);
      return {
        message:
          "We couldn't identify the item from the photo. Describe it in a few words (e.g. brand and model) or send a photo of the tag.",
      };
    }
    await setStage(draft.id, "confirm_identity", { suggestedIdentity: phrase });
    return {
      message: `We think this is: ${phrase}. Is that right?`,
      choices: [
        { label: "Yes, that's it", value: "yes" },
        { label: "No", value: "no" },
      ],
    };
  }

  if (draft.stage === "confirm_identity") {
    const pending = (draft.pending ?? {}) as { suggestedIdentity?: string };
    const suggested = pending.suggestedIdentity ?? "this item";

    if (isYes(body)) {
      await setStage(draft.id, "complete", null);
      return { message: "Got it. We'll look up eBay listings for this item once we have API access." };
    }
    if (isNo(body)) {
      await setStage(draft.id, "awaiting_photos", null);
      return { message: "Send another photo (e.g. of the tag or label) or describe the item in a few words." };
    }

    return {
      message: `Is this a ${suggested}? Reply "Yes" or "No", or send another photo.`,
      choices: [
        { label: "Yes, that's it", value: "yes" },
        { label: "No", value: "no" },
      ],
    };
  }

  return { message: "Send a photo of the item to get started, or say \"I want to sell something\"." };
}
