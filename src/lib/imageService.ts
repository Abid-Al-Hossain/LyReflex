/**
 * LyReflex — Visual Media Service
 *
 * All API keys are read from localStorage (user-provided via the UI).
 * No server-side env vars needed — each user brings their own keys.
 *
 * GIF MODE  →  Giphy (user key from localStorage)
 * IMAGE MODE → Pixabay (user key from localStorage)
 *
 * Fallback cascade (both modes):
 *   Primary API → Wikipedia (free, no key) → Picsum (always works)
 */

export type VisualMode = "gif" | "image";

/** Read a key from localStorage at call-time (always fresh) */
function getKey(lsKey: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(lsKey) ?? "";
}

/** In-memory cache — key includes mode so gif/image don't collide */
const mediaCache = new Map<string, string>();

/* ══════════════════════════════════════════════════════════════════════════ */
/*  GIF PROVIDERS                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/* ── Giphy ────────────────────────────────────────────────────────────────── */
async function fetchGiphy(query: string): Promise<string | null> {
  const key = getKey("lyreflex_giphy_key");
  if (!key) return null;

  const cacheKey = `giphy:${query}`;
  if (mediaCache.has(cacheKey)) return mediaCache.get(cacheKey)!;

  try {
    const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=8&rating=pg&lang=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;

    const json = await res.json();
    const gifs = json.data ?? [];
    if (gifs.length === 0) return null;

    const pick = gifs[Math.floor(Math.random() * Math.min(gifs.length, 5))];
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
  const key = getKey("lyreflex_pixabay_key");
  if (!key) return null;

  const cacheKey = `pixabay:${query}`;
  if (mediaCache.has(cacheKey)) return mediaCache.get(cacheKey)!;

  try {
    const res = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=8&order=popular`
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
 * Fetch a visual (GIF or Image) for the given keyword.
 *
 * GIF mode:   Giphy → Pixabay → Wikipedia → Picsum
 * Image mode: Pixabay → Wikipedia → Picsum
 */
export async function fetchVisual(keyword: string, mode: VisualMode): Promise<string> {
  if (mode === "gif") {
    const giphy = await fetchGiphy(keyword);
    if (giphy) return giphy;
  }

  const pixabay = await fetchPixabay(keyword);
  if (pixabay) return pixabay;

  const wiki = await fetchWikipedia(keyword);
  if (wiki) return wiki;

  return getPicsumFallback(keyword);
}

/** Clear in-memory cache between songs */
export function clearMediaCache(): void {
  mediaCache.clear();
}
