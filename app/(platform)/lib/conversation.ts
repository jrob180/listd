import { getSupabase, type ConversationStage } from "./supabase";

const TRIGGER_PHRASE = "i want to sell something";

export function normalizeBody(body: string): string {
  return body?.trim().toLowerCase() ?? "";
}

export type ProcessInput = {
  from: string;
  body: string;
  mediaUrls: string[];
};

export type ProcessResult = {
  message: string;
};

export async function processInboundMessage(
  input: ProcessInput
): Promise<ProcessResult> {
  const { from, body: rawBody, mediaUrls } = input;
  const body = normalizeBody(rawBody);

  const supabase = getSupabase();
  const { data: row } = await supabase
    .from("sms_conversations")
    .select("*")
    .eq("phone_number", from)
    .single();

  let stage: ConversationStage = row?.stage ?? "idle";
  const photoUrls: string[] = Array.isArray(row?.photo_urls) ? row.photo_urls : [];

  if (stage === "idle") {
    if (body !== normalizeBody(TRIGGER_PHRASE)) {
      return {
        message:
          'Message "i want to sell something" to start listing an item.',
      };
    }
    stage = "awaiting_item";
    await supabase.from("sms_conversations").upsert(
      {
        phone_number: from,
        stage,
        item_name: null,
        condition: null,
        photo_urls: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone_number" }
    );
    return { message: "What's the item you're selling?" };
  }

  if (stage === "awaiting_item") {
    if (mediaUrls.length > 0) {
      return {
        message:
          "First, tell me what the item is in a few words (e.g. vintage jacket, coffee table).",
      };
    }
    const name = body || "Unknown item";
    await updateConversation(supabase, from, {
      stage: "awaiting_photos",
      item_name: name,
    });
    return {
      message:
        "Got it. Send one or more photos of the item, or reply DONE to skip photos.",
    };
  }

  if (stage === "awaiting_photos") {
    const done = body === "done" || body === "skip";
    if (done) {
      await updateConversation(supabase, from, { stage: "awaiting_condition" });
      return {
        message:
          "What's the condition of the item? (e.g. like new, good, fair)",
      };
    }
    if (mediaUrls.length > 0) {
      const newPhotoUrls = [...photoUrls, ...mediaUrls];
      await updateConversation(supabase, from, { photo_urls: newPhotoUrls });
      return {
        message: "Added. Send more photos or reply DONE to continue.",
      };
    }
    if (body) {
      return {
        message: "Reply DONE when you're done with photos, or send a photo.",
      };
    }
    return {
      message: "Send a photo of the item or reply DONE to skip.",
    };
  }

  if (stage === "awaiting_condition") {
    const cond = body || "Not specified";
    await updateConversation(supabase, from, {
      stage: "complete",
      condition: cond,
    });
    return {
      message: "Thanks! We've got everything. We'll be in touch soon.",
    };
  }

  if (stage === "complete") {
    return {
      message: "You're all set. We'll reach out when we have an update.",
    };
  }

  return {
    message:
      'Something went wrong. Message "i want to sell something" to start over.',
  };
}

async function updateConversation(
  supabase: ReturnType<typeof getSupabase>,
  phoneNumber: string,
  updates: Partial<{
    stage: ConversationStage;
    item_name: string | null;
    condition: string | null;
    photo_urls: string[];
  }>
) {
  await supabase
    .from("sms_conversations")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("phone_number", phoneNumber);
}
