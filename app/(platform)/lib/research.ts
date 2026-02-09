/**
 * Research pipeline: vision LLM (identify item + search query) then eBay Browse API.
 * eBay results are the RAG context for extraction. Max 20s budget.
 */

import { getSupabase } from "./supabase";

const RESEARCH_BUDGET_MS = 20_000;

// —— Vision LLM: look at image, return item description + eBay search query ——
export type VisionResult = {
  inferredItem: string;
  searchQuery: string;
};

export async function runVisionResearch(
  imageUrl: string,
  draftId: string
): Promise<{ result: VisionResult | null; status: string; duration_ms: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const start = Date.now();
  const out: { result: VisionResult | null; status: string; duration_ms: number } = {
    result: null,
    status: "error",
    duration_ms: 0,
  };

  if (!apiKey) {
    out.duration_ms = Date.now() - start;
    await saveResearchRun(draftId, "vision", imageUrl, out.result, out.status, out.duration_ms);
    return out;
  }

  const system = `You look at a photo of a clothing item and output JSON only:
{ "inferredItem": "short human-readable item name, e.g. Men's Nike hoodie", "searchQuery": "concise eBay search query, 2-6 words, for finding similar listings" }
Be specific (brand/style if visible). No other text.`;

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
        max_tokens: 150,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: "What is this item and what eBay search query would find similar listings? JSON only." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(Math.max(8000, RESEARCH_BUDGET_MS - (Date.now() - start))),
    });
    out.duration_ms = Date.now() - start;
    if (!res.ok) {
      await saveResearchRun(draftId, "vision", imageUrl, out.result, out.status, out.duration_ms);
      return out;
    }
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      await saveResearchRun(draftId, "vision", imageUrl, out.result, out.status, out.duration_ms);
      return out;
    }
    const parsed = JSON.parse(raw) as { inferredItem?: string; searchQuery?: string };
    out.result = {
      inferredItem: String(parsed.inferredItem ?? "").trim() || "clothing item",
      searchQuery: String(parsed.searchQuery ?? "").trim() || "clothing",
    };
    out.status = "success";
  } catch (err) {
    out.duration_ms = Date.now() - start;
    out.status = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error";
  }
  await saveResearchRun(draftId, "vision", imageUrl, out.result, out.status, out.duration_ms);
  return out;
}

// —— eBay Browse API (RAG corpus for comps + condition terms) ——
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const EBAY_BASE = process.env.EBAY_ENV === "sandbox"
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

async function getEbayToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const res = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: EBAY_SCOPE,
      }).toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

export type EbayItemSummary = {
  itemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  condition?: string;
  conditionId?: string;
  itemWebUrl?: string;
  image?: { imageUrl?: string };
};

export async function runEbaySearch(
  query: string,
  draftId: string
): Promise<{ results: EbayItemSummary[]; status: string; duration_ms: number }> {
  const start = Date.now();
  const run: { results: EbayItemSummary[]; status: string; duration_ms: number } = {
    results: [],
    status: "error",
    duration_ms: 0,
  };

  const token = await getEbayToken();
  if (!token) {
    run.duration_ms = Date.now() - start;
    await saveResearchRun(draftId, "ebay", query, run.results, run.status, run.duration_ms);
    return run;
  }

  try {
    const qs = new URLSearchParams({
      q: query.slice(0, 100),
      limit: "20",
    });
    const res = await fetch(
      `${EBAY_BASE}/buy/browse/v1/item_summary/search?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        },
        signal: AbortSignal.timeout(Math.max(5000, RESEARCH_BUDGET_MS - (Date.now() - start))),
      }
    );
    run.duration_ms = Date.now() - start;
    if (!res.ok) {
      await saveResearchRun(draftId, "ebay", query, run.results, run.status, run.duration_ms);
      return run;
    }
    const data = (await res.json()) as { itemSummaries?: EbayItemSummary[] };
    run.results = (data.itemSummaries ?? []).map((i) => ({
      itemId: i.itemId,
      title: i.title,
      price: i.price,
      condition: i.condition,
      conditionId: i.conditionId,
      itemWebUrl: i.itemWebUrl,
      image: i.image,
    }));
    run.status = "success";
  } catch (err) {
    run.duration_ms = Date.now() - start;
    run.status = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "error";
  }
  await saveResearchRun(draftId, "ebay", query, run.results, run.status, run.duration_ms);
  return run;
}

async function saveResearchRun(
  draftId: string,
  type: "vision" | "ebay",
  query: string,
  results: unknown,
  status: string,
  duration_ms: number
): Promise<void> {
  try {
    await getSupabase().from("research_runs").insert({
      draft_id: draftId,
      type,
      query,
      results,
      status,
      duration_ms,
    });
  } catch {
    // best effort
  }
}

const hasEbayCredentials = (): boolean =>
  !!(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

/**
 * Vision LLM infers item (+ optional eBay search when credentials are configured).
 * When eBay is not available, extraction uses only vision + LLM's own knowledge (RAG = model knowledge).
 */
export async function runResearch(
  draftId: string,
  firstImageUrl: string,
  _searchQueryOverride?: string | null
): Promise<{
  vision: VisionResult | null;
  ebay: EbayItemSummary[];
  visionStatus: string;
  ebayStatus: string;
}> {
  const researchStart = Date.now();
  const budgetRemaining = () => RESEARCH_BUDGET_MS - (Date.now() - researchStart);

  const visionRun = await runVisionResearch(firstImageUrl, draftId);
  const query =
    visionRun.result?.searchQuery?.trim() || visionRun.result?.inferredItem?.trim() || "clothing";

  let ebayRun = { results: [] as EbayItemSummary[], status: "skipped" as string, duration_ms: 0 };
  if (hasEbayCredentials() && budgetRemaining() > 2000) {
    ebayRun = await runEbaySearch(query, draftId);
  }

  return {
    vision: visionRun.result,
    ebay: ebayRun.results,
    visionStatus: visionRun.status,
    ebayStatus: ebayRun.status,
  };
}
