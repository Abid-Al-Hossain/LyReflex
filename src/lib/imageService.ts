/**
 * LyReflex Image Service
 *
 * Priority:
 * 1. Pixabay    — relevant photos, 5,000 req/hr (requires free API key)
 * 2. Pexels     — relevant photos, 200 req/hr  (requires free API key)
 * 3. Wikipedia  — FREE, no key, semantically relevant. Searches Wikipedia
 *                 articles by keyword and returns the article's lead image.
 *                 "starboy" → The Weeknd photo, "Rolls Royce" → car photo,
 *                 "prayer" → prayer image, "money" → cash photo, etc.
 * 4. Picsum     — seeded abstract fallback (always works)
 */

const PIXABAY_KEY = process.env.NEXT_PUBLIC_PIXABAY_API_KEY || "";
const PEXELS_KEY  = process.env.NEXT_PUBLIC_PEXELS_API_KEY  || "";

/** In-memory cache so we never fetch the same keyword twice per session */
const imageCache = new Map<string, string>();

/* ── Pixabay ──────────────────────────────────────────────────────────────── */
async function fetchPixabay(query: string): Promise<string | null> {
  if (!PIXABAY_KEY) return null;
  const cacheKey = `pixabay:${query}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;
  try {
    const res  = await fetch(
      `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=5&order=popular`
    );
    const data = await res.json();
    if (data.hits?.length > 0) {
      const url = data.hits[Math.floor(Math.random() * data.hits.length)].largeImageURL as string;
      imageCache.set(cacheKey, url);
      return url;
    }
  } catch { /* swallow */ }
  return null;
}

/* ── Pexels ───────────────────────────────────────────────────────────────── */
async function fetchPexels(query: string): Promise<string | null> {
  if (!PEXELS_KEY) return null;
  const cacheKey = `pexels:${query}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;
  try {
    const res  = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    const data = await res.json();
    if (data.photos?.length > 0) {
      const url = data.photos[Math.floor(Math.random() * data.photos.length)].src.large2x as string;
      imageCache.set(cacheKey, url);
      return url;
    }
  } catch { /* swallow */ }
  return null;
}

/* ── Wikipedia Image API ──────────────────────────────────────────────────── */
/**
 * Uses the free Wikipedia/MediaWiki API to find the lead image of the article
 * most relevant to the keyword. This gives us high-quality, contextually 
 * accurate photos without any API key or rate limits.
 *
 * Examples:
 *   "Rolls Royce"       → Rolls-Royce Phantom photo
 *   "diamond jewelry"   → Diamond necklace photo
 *   "nightclub"         → Nightclub interior photo
 *   "achievement"       → Trophy/podium photo
 *   "prayer"            → Hands in prayer photo
 *   "money"             → Cash/currency photo
 *   "basketball"        → Basketball on court photo
 */
async function fetchWikipedia(query: string): Promise<string | null> {
  const cacheKey = `wiki:${query}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;

  try {
    // Step 1: Search Wikipedia for the best matching article title
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6_000) });
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const hits = searchData.query?.search ?? [];
    if (hits.length === 0) return null;

    // Step 2: Try the top search results until we find one with a lead image
    for (const hit of hits.slice(0, 3)) {
      const title      = hit.title as string;
      const imageUrl   = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&format=json&pithumbsize=1280&origin=*`;
      const imageRes   = await fetch(imageUrl, { signal: AbortSignal.timeout(6_000) });
      if (!imageRes.ok) continue;

      const imageData  = await imageRes.json();
      const pages      = imageData.query?.pages ?? {};
      const page       = Object.values(pages)[0] as { thumbnail?: { source: string } };
      const src        = page?.thumbnail?.source;

      if (src) {
        // Upgrade the thumbnail to max resolution by removing the width suffix
        // e.g. "...320px-foo.jpg" → "...1280px-foo.jpg"
        const hq = src.replace(/\/\d+px-/, "/1280px-");
        imageCache.set(cacheKey, hq);
        return hq;
      }
    }
  } catch { /* swallow */ }

  return null;
}

/* ── Picsum seeded fallback ───────────────────────────────────────────────── */
function getPicsumFallback(keyword: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(keyword.toLowerCase().trim() || "music")}/1280/720`;
}

/* ── Main export ──────────────────────────────────────────────────────────── */
export async function fetchImage(keyword: string): Promise<string> {
  // 1. Pixabay (fast, relevant, needs free key)
  const pixabay = await fetchPixabay(keyword);
  if (pixabay) return pixabay;

  // 2. Pexels (fast, relevant, needs free key)
  const pexels = await fetchPexels(keyword);
  if (pexels) return pexels;

  // 3. Wikipedia (free, no key, semantically accurate images)
  const wiki = await fetchWikipedia(keyword);
  if (wiki) return wiki;

  // 4. Picsum seeded fallback (always works)
  return getPicsumFallback(keyword);
}

/** Clear the in-memory cache between songs */
export function clearImageCache(): void {
  imageCache.clear();
}
