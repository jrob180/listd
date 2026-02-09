import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getSupabase() {
  return createClient(url, serviceKey);
}

export type ConversationStage =
  | "idle"
  | "awaiting_item"
  | "awaiting_photos"
  | "awaiting_condition"
  | "complete";

export type SmsConversation = {
  id: string;
  phone_number: string;
  stage: ConversationStage;
  item_name: string | null;
  condition: string | null;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
};
