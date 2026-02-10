/**
 * Channel3 image lookup: primary identification for SKU-first intake.
 * API key: CHANNEL3_API_KEY. Base URL: CHANNEL3_BASE_URL (optional).
 */

export type Channel3VariantOptions = {
  sizes?: string[];
  colors?: string[];
  department?: string[];
};

export type Channel3Result = {
  title: string;
  brand: string;
  category: string;
  confidence: number;
  variant_options: Channel3VariantOptions;
  product_url: string;
  image_urls: string[];
  /** Top candidate titles from search (for multi-option identity questions). */
  candidate_titles?: string[];
  /** Full candidate set with images for UI. */
  candidates?: { title: string; image_urls: string[] }[];
};

// According to Channel3 docs, the public API base is api.trychannel3.com
const DEFAULT_BASE = "https://api.trychannel3.com";

function getBaseUrl(): string {
  return process.env.CHANNEL3_BASE_URL?.trim() || DEFAULT_BASE;
}

/**
 * Identify product from image URL. Returns normalized result or null if missing/fails.
 */
export async function lookupByImage(imageUrl: string, opts?: { limit?: number }): Promise<Channel3Result | null> {
  const apiKey = process.env.CHANNEL3_API_KEY?.trim();
  if (!apiKey) {
    console.log("[channel3] missing CHANNEL3_API_KEY, skipping lookup for", imageUrl);
    return null;
  }

  const limit = Math.max(1, Math.min(25, opts?.limit ?? 9));
  const base = getBaseUrl().replace(/\/$/, "");
  // Use /v0/search with image_url, as per https://docs.trychannel3.com/api-reference/channel3-api/search
  const url = `${base}/v0/search`;

  try {
    console.log("[channel3] calling identify", { url, imageUrl });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ image_url: imageUrl, limit }),
      signal: AbortSignal.timeout(15000),
    });
    console.log("[channel3] identify response", { status: res.status, ok: res.ok });
    if (!res.ok) {
      // Best-effort log of error body for debugging
      let errorBody: unknown = null;
      try {
        errorBody = await res.text();
      } catch {
        // ignore
      }
      console.log("[channel3] identify error body", errorBody);
      return null;
    }
    const data = (await res.json()) as unknown;
    console.log("[channel3] identify parsed body", data);
    return normalizeChannel3Response(data, { limit });
  } catch (err) {
    console.log("[channel3] identify threw", (err as Error)?.message ?? err);
    return null;
  }
}

function normalizeChannel3Response(raw: unknown, opts?: { limit?: number }): Channel3Result | null {
  // Docs: /v0/search returns an array of Product objects
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const limit = Math.max(1, Math.min(25, opts?.limit ?? 9));
  const products = (raw as any[]).slice(0, limit);

  // Use score to derive confidence in [0,1]
  const maxScore =
    products.reduce((max, p) => {
      const s = typeof p.score === "number" ? p.score : 0;
      return s > max ? s : max;
    }, 0) || 1;

  const primary = products[0] ?? {};

  const title = typeof primary.title === "string" ? primary.title : "Unknown";
  const brand = typeof primary.brand_name === "string" ? primary.brand_name : "";

  const category =
    Array.isArray(primary.categories) && typeof primary.categories[0] === "string"
      ? (primary.categories[0] as string)
      : "";

  const product_url = typeof primary.url === "string" ? primary.url : "";

  const image_urls = Array.isArray(primary.image_urls)
    ? (primary.image_urls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  let confidence = 0;
  if (typeof primary.score === "number") {
    confidence = Math.min(1, Math.max(0, primary.score / maxScore));
  } else {
    confidence = 0.7; // reasonable default when score missing
  }

  // Derive department from gender when available
  const department: string[] = [];
  if (primary.gender === "male") department.push("Men");
  else if (primary.gender === "female") department.push("Women");
  else if (primary.gender === "unisex") department.push("Unisex");

  // Build candidate titles for 2–3 options
  const candidate_titles = products
    .map((p) => (typeof p.title === "string" ? p.title : ""))
    .filter((t) => t && t !== title)
    .slice(0, Math.max(0, limit - 1));

  // Try to infer colors from titles/categories/key_features/variants
  const colorWords = ["black", "white", "red", "blue", "green", "yellow", "orange", "grey", "gray", "brown", "pink", "purple", "navy", "olive"];
  const colorSet = new Set<string>();

  const addColorsFromText = (text: unknown) => {
    if (typeof text !== "string") return;
    const lower = text.toLowerCase();
    for (const c of colorWords) {
      if (lower.includes(c)) colorSet.add(c.charAt(0).toUpperCase() + c.slice(1));
    }
  };

  addColorsFromText(primary.title);
  if (Array.isArray(primary.categories)) {
    for (const c of primary.categories) addColorsFromText(c);
  }
  if (Array.isArray(primary.key_features)) {
    for (const f of primary.key_features) addColorsFromText(f);
  }
  if (Array.isArray(primary.variants)) {
    for (const v of primary.variants) addColorsFromText(v?.title);
  }

  const colors = Array.from(colorSet);

  const variant_options: Channel3VariantOptions = {
    sizes: [], // Channel3 search API does not expose structured sizes directly
    colors: colors.length ? colors : undefined,
    department: department.length ? department : undefined,
  };

  return {
    title,
    brand,
    category,
    confidence,
    variant_options,
    product_url,
    image_urls,
    candidate_titles,
    candidates: products.map((p) => {
      const t = typeof p.title === "string" ? p.title : "";
      const imgs = Array.isArray(p.image_urls)
        ? (p.image_urls as unknown[]).filter((u): u is string => typeof u === "string")
        : [];
      return { title: t, image_urls: imgs };
    }),
  };
}

