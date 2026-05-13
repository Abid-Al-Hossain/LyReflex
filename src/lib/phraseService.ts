/**
 * LyReflex — Semantic Phrase Detection via Groq LLM
 *
 * ONE Groq chat call:
 *  1. Receives the plain transcript text (NOT per-word timestamps — avoids 413)
 *  2. Groups it into meaningful lyric phrases + extracts a visual keyword each
 *  3. Returns JSON array [{text, keyword}, ...]
 *
 * Timestamps are then mapped back locally using word-count alignment
 * against the original Whisper word array — cheap, no extra API calls.
 *
 * Falls back to the dumb 5-word grouper (lyrics.ts) if Groq fails.
 */

import { LyricMoment } from "@/types";
import { TranscriptWord } from "@/lib/transcription";
import { groupChunksIntoPhrases, extractKeyword } from "@/lib/lyrics";

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are a music lyric phrase analyzer for a visual music player.

Given the full lyrics of a song (plain text), split them into meaningful, complete lyric phrases — the way a human reads song lines.

Return ONLY a raw JSON array. No markdown. No code fences. No explanation. Just the JSON.

Format:
[{"text":"complete phrase here","keyword":"search term"},...]

Rules:
- "text": one complete lyrical thought — a full line or repeated chorus unit
- "keyword": ONE vivid, concrete noun or noun phrase (max 2 words) for image search. Be specific: "luxury car" not "car", "diamond ring" not "jewelry"
- Cover the ENTIRE lyrics — no lines skipped
- Repeated lines (e.g. a chorus) get separate entries each time they appear
- Keep phrases short enough to display on screen (max ~10 words per phrase)`;

interface RawPhrase {
  text:    string;
  keyword: string;
}

/* ── Main export ──────────────────────────────────────────────────────────── */
export async function getSemanticPhrases(
  words:       TranscriptWord[],
  groqApiKey:  string | null | undefined,
  songDuration: number
): Promise<LyricMoment[]> {
  if (!groqApiKey || words.length === 0) {
    return fallback(words);
  }

  // Build plain transcript — no timestamps, dramatically smaller payload
  const fullText = words.map((w) => w.word).join(" ").trim();
  if (!fullText) return fallback(words);

  try {
    const res = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `Lyrics:\n${fullText}` },
        ],
        max_tokens: 2048,
        temperature: 0.2,
        // NO response_format — llama-3.1-8b-instant doesn't support json_object mode
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn(`[LyReflex] Groq phrase detection failed: ${res.status}`);
      return fallback(words);
    }

    const data    = await res.json();
    const content = (data.choices?.[0]?.message?.content ?? "") as string;

    // Strip markdown fences if Groq wraps the JSON anyway
    const cleaned = content
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/,        "")
      .trim();

    let parsed: RawPhrase[] | null = null;
    try {
      const raw = JSON.parse(cleaned);
      if (Array.isArray(raw))                 parsed = raw;
      else if (Array.isArray(raw.phrases))    parsed = raw.phrases;
      else if (Array.isArray(raw.data))       parsed = raw.data;
      else {
        const arrVal = Object.values(raw).find(Array.isArray) as RawPhrase[] | undefined;
        if (arrVal) parsed = arrVal;
      }
    } catch {
      console.warn("[LyReflex] Could not parse Groq phrase JSON, falling back.");
      return fallback(words);
    }

    if (!parsed || parsed.length === 0) {
      return fallback(words);
    }

    // Align phrase texts → word timestamps
    return alignPhrasesToWords(parsed, words, songDuration);

  } catch (err) {
    console.warn("[LyReflex] Groq phrase detection threw:", err);
    return fallback(words);
  }
}

/* ── Timestamp alignment ──────────────────────────────────────────────────── */
/**
 * Groq only tells us the phrase TEXTS. We map each phrase back to the
 * original Whisper word array by consuming words proportionally to the
 * number of words in each phrase.
 *
 * This is O(n) and works well because Groq reliably preserves word order.
 */
function alignPhrasesToWords(
  phrases:     RawPhrase[],
  words:       TranscriptWord[],
  songDuration: number
): LyricMoment[] {
  // Pre-normalise phrase texts so word counts match the transcript
  const phraseWordCounts = phrases.map((p) =>
    p.text.trim().split(/\s+/).filter(Boolean).length
  );
  const totalPhraseWords = phraseWordCounts.reduce((a, b) => a + b, 0);
  const totalTransWords  = words.length;

  const results: LyricMoment[] = [];
  let wordIdx = 0;

  for (let pi = 0; pi < phrases.length; pi++) {
    const phrase = phrases[pi];

    // Scale phrase word count to transcript length
    // (Groq might normalise contractions etc., so counts may differ slightly)
    const rawCount  = phraseWordCounts[pi];
    const scaled    = Math.max(1, Math.round((rawCount / totalPhraseWords) * totalTransWords));
    const clampedEnd = Math.min(wordIdx + scaled - 1, words.length - 1);

    const startTime = words[wordIdx]?.start ?? 0;
    const endTime   =
      pi === phrases.length - 1
        ? songDuration
        : (words[Math.min(wordIdx + scaled, words.length - 1)]?.start ?? songDuration);

    results.push({
      text:      phrase.text.trim(),
      keyword:   ((phrase.keyword ?? "").trim().toLowerCase() || extractKeyword(phrase.text)),
      startTime: Math.max(0, startTime),
      endTime:   Math.min(songDuration, Math.max(startTime + 0.5, endTime)),
      imageUrl:  "",
    });

    wordIdx = clampedEnd + 1;
    if (wordIdx >= words.length) wordIdx = words.length - 1;
  }

  // Guarantee last phrase reaches song end
  if (results.length > 0) {
    results[results.length - 1].endTime = songDuration;
  }

  return results.filter((r) => r.endTime > r.startTime);
}

/* ── Fallback: dumb 5-word grouper ───────────────────────────────────────── */
function fallback(words: TranscriptWord[]): LyricMoment[] {
  const chunks = words.map((w) => ({
    text:      ` ${w.word}`,
    timestamp: [w.start, w.end] as [number, number | null],
  }));
  return groupChunksIntoPhrases(chunks, 5);
}
