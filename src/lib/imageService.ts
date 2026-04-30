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

/**
 * Generates a prompt-based AI image using Pollinations.ai.
 * This guarantees a highly relevant, cinematic image based on the lyric phrase.
 */
function getPollinationsImage(keyword: string): string {
  // Add styling keywords to ensure consistent, cinematic, dark-themed visuals
  // nologo=true removes the watermark
  const prompt = `${keyword}, cinematic photography, dark moody lighting, highly detailed, 4k`;
  const encoded = encodeURIComponent(prompt.trim());
  const seed = Math.floor(Math.random() * 100000);
  return `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&nologo=true&seed=${seed}`;
}

/**
 * Main image fetch function:
 * 1. Tries Pixabay (if key provided)
 * 2. Tries Pexels (if key provided)
 * 3. Uses Pollinations.ai Generative AI (zero config, highly relevant)
 */
export async function fetchImage(keyword: string): Promise<string> {
  const pixabayResult = await fetchPixabay(keyword);
  if (pixabayResult) return pixabayResult;

  const pexelsResult = await fetchPexels(keyword);
  if (pexelsResult) return pexelsResult;

  // Generative AI fallback — creates exactly what the lyrics describe!
  return getPollinationsImage(keyword);
}

/** Forces browser to pre-download image into its cache and returns a Promise */
export function preCacheImage(url: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload  = () => resolve();
    img.onerror = () => resolve(); // Resolve anyway so it doesn't block the app
    img.src = url;
  });
}

/** Clear the in-memory cache (e.g., between songs) */
export function clearImageCache(): void {
  imageCache.clear();
}
