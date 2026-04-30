const PEXELS_API_KEY = process.env.NEXT_PUBLIC_PEXELS_API_KEY || "";

export async function fetchPexelsImage(query: string): Promise<string | null> {
  if (!PEXELS_API_KEY) {
    console.warn("Pexels API key not found. Using placeholder images.");
    return `https://images.unsplash.com/photo-1464802686167-b939a67e06a1?auto=format&fit=crop&w=1200&q=80`; // Default cosmic image
  }

  try {
    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    });

    const data = await response.json();
    if (data.photos && data.photos.length > 0) {
      return data.photos[0].src.large2x;
    }
    return null;
  } catch (error) {
    console.error("Error fetching image from Pexels:", error);
    return null;
  }
}

export function preCacheImage(url: string) {
  if (typeof window !== "undefined") {
    const img = new Image();
    img.src = url;
  }
}
