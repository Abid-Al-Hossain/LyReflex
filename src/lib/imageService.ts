/**
 * LyReflex — Visual Media Service
 *
 * Two modes controlled by user preference:
 *
 * GIF MODE  →  Giphy API  (world's largest GIF library, free beta key)
 *              Endpoint: https://api.giphy.com/v1/gifs/search
 *              Rate: 100 req/hr (beta), plenty for time-driven rolling buffer
 *              Returns animated GIFs that feel alive with the music
 *
 * IMAGE MODE → Pixabay API (high-quality stock photos, free key)
 *              Endpoint: https://pixabay.com/api/
 *              Rate: 5,000 req/hr (generous)
 *              Returns cinematic-quality still photos
 *
 * Fallback cascade (both modes):
 *   1. Primary API (Giphy/Pixabay depending on mode)
 *   2. Pexels (good photo fallback)
 *   3. Wikipedia (free, no key, always works)
 *   4. Picsum (seeded abstract placeholder, never fails)
 */

export type VisualMode = "gif" | "image";

const PIXABAY_KEY = process.env.NEXT_PUBLIC_PIXABAY_API_KEY || "";
const PEXELS_KEY  = process.env.NEXT_PUBLIC_PEXELS_API_KEY  || "";
const GIPHY_KEY   = process.env.NEXT_PUBLIC_GIPHY_API_KEY   || "";

/** In-memory cache — key includes mode so gif/image don't collide */
const mediaCache = new Map<string, string>();

/* ══════════════════════════════════════════════════════════════════════════ */
/*  GIF PROVIDERS                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/* ── Giphy ────────────────────────────────────────────────────────────────── */
/**
 * World's largest GIF search. Free beta key: 100 req/hr.
 * Returns the `fixed_width` rendition — optimized for web, ~200-500KB per GIF.
 * Using `rating=pg` to keep it safe.
 */
async function fetchGiphy(query: string): Promise<string | null> {
  if (!GIPHY_KEY) return null;
  const cacheKey = `giphy:${query}`;
  if (mediaCache.has(cacheKey)) return mediaCache.get(cacheKey)!;

  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=8&rating=pg&lang=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;

    const json = await res.json();
    const gifs = json.data ?? [];
    if (gifs.length === 0) return null;

    // Pick from the top 5 for variety
    const pick = gifs[Math.floor(Math.random() * Math.min(gifs.length, 5))];
    // Use fixed_width for consistent rendering (not too big, not too small)
    const gifUrl = (pick.images?.fixed_width?.url ?? pick.images?.original?.url ?? "") as string;

    if (gifUrl) {
      mediaCache.set(cacheKey, gifUrl);
      return gifUrl;
    }
  } catch { /* swallow */ }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  IMAGE PROVIDERS                                                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/* ── Pixabay ──────────────────────────────────────────────────────────────── */
async function fetchPixabay(query: string): Promise<string | null> {
  if (!PIXABAY_KEY) return null;
  const cacheKey = `pixabay:${query}`;
  if (mediaCache.has(cacheKey)) return mediaCache.get(cacheKey)!;

  try {
    const res  = await fetch(
      `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=8&order=popular`
    );
    const data = await res.json();
    if (data.hits?.length > 0) {
      const pick = data.hits[Math.floor(Math.random() * Math.min(data.hits.length, 5))];
      const url  = (pick.largeImageURL ?? pick.webformatURL) as string;
      if (url) { mediaCache.set(cacheKey, url); return url; }
    }
  } catch { /* swallow */ }
  return null;
}

/* ── Pexels ───────────────────────────────────────────────────────────────── */
async function fetchPexels(query: string): Promise<string | null> {
  if (!PEXELS_KEY) return null;
  const cacheKey = `pexels:${query}`;
  if (mediaCache.has(cacheKey)) return mediaCache.get(cacheKey)!;

  try {
    const res  = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    const data = await res.json();
    if (data.photos?.length > 0) {
      const url = data.photos[Math.floor(Math.random() * data.photos.length)].src.large2x as string;
      if (url) { mediaCache.set(cacheKey, url); return url; }
    }
  } catch { /* swallow */ }
  return null;
}

/* ── Wikipedia ────────────────────────────────────────────────────────────── */
async function fetchWikipedia(query: string): Promise<string | null> {
  const cacheKey = `wiki:${query}`;
  if (mediaCache.has(cacheKey)) return mediaCache.get(cacheKey)!;

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6_000) });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const hits = searchData.query?.search ?? [];
    if (hits.length === 0) return null;

    for (const hit of hits.slice(0, 3)) {
      const title    = hit.title as string;
      const imageUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&format=json&pithumbsize=1280&origin=*`;
      const imageRes = await fetch(imageUrl, { signal: AbortSignal.timeout(6_000) });
      if (!imageRes.ok) continue;

      const imageData = await imageRes.json();
      const pages     = imageData.query?.pages ?? {};
      const page      = Object.values(pages)[0] as { thumbnail?: { source: string } };
      const src       = page?.thumbnail?.source;

      if (src) {
        const hq = src.replace(/\/\d+px-/, "/1280px-");
        mediaCache.set(cacheKey, hq);
        return hq;
      }
    }
  } catch { /* swallow */ }
  return null;
}

/* ── Picsum fallback ──────────────────────────────────────────────────────── */
function getPicsumFallback(keyword: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(keyword.toLowerCase().trim() || "music")}/1280/720`;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  MAIN EXPORTS                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch a visual (GIF or Image) for the given keyword, using the specified mode.
 *
 * GIF mode cascade:   Giphy → Pixabay → Wikipedia → Picsum
 * Image mode cascade: Pixabay → Pexels → Wikipedia → Picsum
 */
export async function fetchVisual(keyword: string, mode: VisualMode): Promise<string> {
  if (mode === "gif") {
    // 1. Giphy (animated GIFs — the primary source for GIF mode)
    const giphy = await fetchGiphy(keyword);
    if (giphy) return giphy;

    // 2. Fall through to image providers if no GIF found
  }

  // Image cascade (used by both modes as fallback)
  const pixabay = await fetchPixabay(keyword);
  if (pixabay) return pixabay;

  const pexels = await fetchPexels(keyword);
  if (pexels) return pexels;

  const wiki = await fetchWikipedia(keyword);
  if (wiki) return wiki;

  return getPicsumFallback(keyword);
}

/** Clear in-memory cache between songs */
export function clearMediaCache(): void {
  mediaCache.clear();
}

/** Check which APIs are configured */
export function getConfiguredAPIs(): { giphy: boolean; pixabay: boolean; pexels: boolean } {
  return {
    giphy:   !!GIPHY_KEY,
    pixabay: !!PIXABAY_KEY,
    pexels:  !!PEXELS_KEY,
  };
}
