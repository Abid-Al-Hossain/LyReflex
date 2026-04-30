/**
 * LyReflex Image Service
 *
 * Strategy (best free APIs):
 * 1. PRIMARY  → Pixabay  — 5,000 req/hr free, no attribution required,
 *                           caching allowed, massive library (photos + vectors)
 * 2. FALLBACK → Pexels   — 200 req/hr / 20,000 req/month, developer-friendly CDN
 *
 * Why not Unsplash?
 *   - Only 50 req/hr on demo tier
 *   - Mandatory hotlinking (no caching)
 *   - Stricter attribution enforcement in API terms
 *
 * We use Pixabay first because it has the highest free rate limit (100x Unsplash)
 * and allows caching, which is critical for pre-loading images before the song starts.
 */

const PIXABAY_KEY = process.env.NEXT_PUBLIC_PIXABAY_API_KEY || "";
const PEXELS_KEY  = process.env.NEXT_PUBLIC_PEXELS_API_KEY  || "";

/** In-memory cache to avoid duplicate API calls for the same keyword */
const imageCache = new Map<string, string>();

async function fetchPixabay(query: string): Promise<string | null> {
  if (!PIXABAY_KEY) return null;

  const cacheKey = `pixabay:${query}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;

  try {
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&orientation=horizontal&safesearch=true&per_page=5&order=popular`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.hits && data.hits.length > 0) {
      // Pick a random result from top-5 for visual variety on repeat keywords
      const pick = data.hits[Math.floor(Math.random() * data.hits.length)];
      const imageUrl = pick.largeImageURL as string;
      imageCache.set(cacheKey, imageUrl);
      return imageUrl;
    }
    return null;
  } catch (err) {
    console.error("[LyReflex] Pixabay error:", err);
    return null;
  }
}

async function fetchPexels(query: string): Promise<string | null> {
  if (!PEXELS_KEY) return null;

  const cacheKey = `pexels:${query}`;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey)!;

  try {
    const res  = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`, {
      headers: { Authorization: PEXELS_KEY },
    });
    const data = await res.json();

    if (data.photos && data.photos.length > 0) {
      const pick = data.photos[Math.floor(Math.random() * data.photos.length)];
      const imageUrl = pick.src.large2x as string;
      imageCache.set(cacheKey, imageUrl);
      return imageUrl;
    }
    return null;
  } catch (err) {
    console.error("[LyReflex] Pexels error:", err);
    return null;
  }
}

/** Curated fallback map for common music themes when no API key is configured */
const THEME_FALLBACKS: Record<string, string> = {
  default:      "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=1400&q=85",
  space:        "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1400&q=85",
  ocean:        "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1400&q=85",
  forest:       "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1400&q=85",
  city:         "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1400&q=85",
  sunset:       "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1400&q=85",
  rain:         "https://images.unsplash.com/photo-1501999635878-71cb5379c2d8?w=1400&q=85",
  fire:         "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=1400&q=85",
  love:         "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=1400&q=85",
  mountain:     "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1400&q=85",
};

function getThemeFallback(keyword: string): string {
  const lower = keyword.toLowerCase();
  for (const [theme, url] of Object.entries(THEME_FALLBACKS)) {
    if (lower.includes(theme)) return url;
  }
  return THEME_FALLBACKS.default;
}

/**
 * Main image fetch function:
 * Tries Pixabay → Pexels → curated fallback
 */
export async function fetchImage(keyword: string): Promise<string> {
  const pixabayResult = await fetchPixabay(keyword);
  if (pixabayResult) return pixabayResult;

  const pexelsResult = await fetchPexels(keyword);
  if (pexelsResult) return pexelsResult;

  // Graceful degradation: themed static fallbacks
  return getThemeFallback(keyword);
}

/** Forces browser to pre-download image into its cache */
export function preCacheImage(url: string): void {
  if (typeof window === "undefined") return;
  const img = new window.Image();
  img.src = url;
}

/** Clear the in-memory cache (e.g., between songs) */
export function clearImageCache(): void {
  imageCache.clear();
}
