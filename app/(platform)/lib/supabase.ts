import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getSupabase() {
  return createClient(url, serviceKey);
}

export type SmsUser = { id: string; phone_number: string };

export type PendingPrompt =
  | { type: "confirm_identity"; suggested: string; meta?: Record<string, unknown> }
  | { type: "choose_one"; choices: string[]; meta?: Record<string, unknown> }
  | { type: "browse_alternatives"; choices: string[]; meta?: { index: number; source?: string; candidates?: { title: string; image_urls: string[] }[] } }
  | { type: "ask_label_photo" }
  | { type: "choose_variant"; variant_key: string; choices: string[]; meta?: Record<string, unknown> }
  | { type: "choose_condition"; suggested?: string; choices: string[] }
  | { type: "pricing"; step: "price_type" | "floor_price" }
  | { type: "final_confirm"; summary: string };

export type ListingDraft = {
  id: string;
  user_id: string;
  status: "active" | "complete" | "abandoned";
  stage: string;
  pending?: PendingPrompt | null;
  created_at: string;
  updated_at: string;
};

export type DraftMessage = {
  id: string;
  draft_id: string;
  direction: "in" | "out";
  body: string;
  twilio_media_urls: string[];
  storage_media_urls: string[];
  created_at: string;
};

export type DraftPhoto = {
  id: string;
  draft_id: string;
  kind: "user" | "reference";
  storage_url: string;
  created_at: string;
};

export type DraftFact = {
  id: string;
  draft_id: string;
  key: string;
  value: unknown;
  confidence: number;
  source: string;
  status: "proposed" | "confirmed" | "rejected";
  evidence: unknown;
  created_at: string;
  updated_at: string;
};

export type ResearchRun = {
  id: string;
  draft_id: string;
  type: "lens" | "ebay";
  query: string;
  results: unknown;
  status: string;
  duration_ms: number | null;
  created_at: string;
};

export const DRAFT_PHOTOS_BUCKET = "draft-photos";
