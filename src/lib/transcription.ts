/**
 * LyReflex — Audio Transcription Service
 *
 * Priority:
 *  1. Groq Whisper Large v3  → ~1-2 s, word timestamps, needs free key
 *  2. HuggingFace Inference  → ~15-30 s, no key, text only
 *
 * Get a free Groq key at https://console.groq.com (generous free tier).
 * Set NEXT_PUBLIC_GROQ_API_KEY in .env.local to enable it.
 */

export interface TranscriptWord {
  word:  string;
  start: number; // seconds
  end:   number;
}

/* ── Groq Whisper Large v3 ───────────────────────────────────────────────────
 * ~1-2 seconds for any song length. Word-level timestamps.
 * Free tier: 2 000 requests/day, audio up to 25 MB.
 * ────────────────────────────────────────────────────────────────────────── */
async function transcribeWithGroq(
  file:     File,
  apiKey:   string,
  onStatus: (m: string) => void
): Promise<TranscriptWord[]> {
  onStatus("Transcribing with Groq Whisper Large v3…");

  const form = new FormData();
  form.append("file",  file);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form }
  );

  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (Array.isArray(data.words) && data.words.length > 0) {
    return data.words.map((w: { word: string; start: number; end: number }) => ({
      word: w.word, start: w.start, end: w.end,
    }));
  }

  // Groq returned text only — distribute evenly
  return distributeWordsEvenly(data.text ?? "", 0);
}

/* ── HuggingFace Inference API (zero-config fallback) ────────────────────────
 * Runs server-side Whisper. Free, no key, ~15-30 s.
 * Retries on 503 (model cold-start).
 * ────────────────────────────────────────────────────────────────────────── */
async function transcribeWithHF(
  file:     File,
  onStatus: (m: string) => void
): Promise<{ text: string }> {
  const url    = "https://api-inference.huggingface.co/models/openai/whisper-base";
  const buffer = await file.arrayBuffer();

  for (let attempt = 1; attempt <= 5; attempt++) {
    onStatus(
      attempt === 1
        ? "Transcribing via HuggingFace Whisper (server-side)…"
        : `Model warming up, retrying (${attempt}/5)…`
    );

    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": file.type || "audio/mpeg" },
      body:    buffer,
    });

    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 7_000));
      continue;
    }
    if (!res.ok) throw new Error(`HuggingFace ${res.status}`);

    const data = await res.json();
    return { text: data.text ?? data[0]?.generated_text ?? "" };
  }
  throw new Error("HuggingFace model unavailable. Please set NEXT_PUBLIC_GROQ_API_KEY.");
}

/* ── Helper: evenly spread words across duration ─────────────────────────── */
function distributeWordsEvenly(
  text:         string,
  durationSecs: number
): TranscriptWord[] {
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^\w']/g, ""))
    .filter(Boolean);

  if (!words.length) return [];

  const interval = durationSecs / words.length || 3;
  return words.map((word, i) => ({
    word,
    start: i * interval,
    end:   (i + 1) * interval,
  }));
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export async function transcribeAudio(
  file:         File,
  durationSecs: number,
  onStatus:     (m: string) => void,
  groqApiKey?:  string  // pass from client (localStorage or env)
): Promise<TranscriptWord[]> {
  // Prefer explicitly-passed key, then env var
  const key = groqApiKey ?? process.env.NEXT_PUBLIC_GROQ_API_KEY;

  if (key) {
    return transcribeWithGroq(file, key, onStatus);
  }

  // HF fallback — text only, distribute evenly across song
  const { text } = await transcribeWithHF(file, onStatus);
  return distributeWordsEvenly(text, durationSecs);
}
