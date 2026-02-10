/**
 * Use the best Gemini model to identify the exact product in user photos.
 * Returns a short phrase we'll later use to query eBay (e.g. "Nike Air Max 270 React").
 */

// gemini-2.5-pro has no free-tier quota (429). gemini-1.5-flash returns 404 (not in v1beta). Use 2.5-flash.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

async function fetchImageAsBase64(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn("[gemini] image fetch failed", { url: url.slice(0, 80), status: res.status });
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();
    const buf = await res.arrayBuffer();
    const data = Buffer.from(buf).toString("base64");
    return { mimeType, data };
  } catch (err) {
    console.warn("[gemini] image fetch error", { url: url.slice(0, 80), error: (err as Error).message });
    return null;
  }
}

/**
 * Given one or more image URLs and optional user text, return a single exact-item phrase
 * suitable for later eBay search (e.g. "Men's Nike Air Force 1 Low 07 White").
 */
export async function identifyItem(
  imageUrls: string[],
  userText?: string | null
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];

  const prompt =
    "Identify the exact product in this image for a resale listing. Reply with ONLY one short phrase that is specific enough to search on eBay. Include: brand, exact model/silhouette name (e.g. Jordan 1 Retro High OG, not just 'Air Jordan'), and colorway (e.g. Black Red, Chicago, Bred). Examples: 'Nike Air Jordan 1 Retro High OG Black Red', 'Nike Dunk Low Panda'. Be specific—avoid generic names like 'Nike Air Jordan' or 'Nike sneakers'. No other text.";
  const userPart = [userText?.trim(), prompt].filter(Boolean).join("\n\nUser also said: ");
  parts.push({ text: userPart });

  for (const url of imageUrls.slice(0, 4)) {
    const img = await fetchImageAsBase64(url);
    if (img) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }

  if (parts.length === 1) {
    console.warn("[gemini] identifyItem: no images could be loaded", { imageUrls: imageUrls.length });
    return null;
  }

  try {
    const res = await fetch(GEMINI_URL(GEMINI_MODEL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: 128, temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      console.warn("[gemini] API error", { status: res.status, body: bodyText.slice(0, 500) });
      return null;
    }
    const json = JSON.parse(bodyText) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.warn("[gemini] no text in response", { body: bodyText.slice(0, 500) });
    }
    return text || null;
  } catch (err) {
    console.warn("[gemini] identifyItem threw", { error: (err as Error).message });
    return null;
  }
}
