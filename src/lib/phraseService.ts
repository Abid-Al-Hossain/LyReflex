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

const SYSTEM_PROMPT = `You are an expert music video director and visual curator for a lyric visualizer app.

Given the full plain-text lyrics of a song, you must:
1. Split the lyrics into meaningful, complete lyric phrases (the way a human reads song lines)
2. For each phrase, assign ONE perfect background image search keyword

Return ONLY a raw JSON array. No markdown fences. No explanation. Raw JSON only.

Format:
[{"text":"complete lyric phrase","keyword":"visual search term"},...]

══════════════════════════════════════════════
KEYWORD RULES — READ EVERY RULE CAREFULLY
══════════════════════════════════════════════

RULE 1 — NEVER USE THESE AS KEYWORDS:
✗ Profanity: "bitch", "fuck", "shit", "ass", "nigga", "damn", "hell"
✗ Drug slang: "lean", "xans", "molly", "crack"
✗ Slang taken literally: "ghost", "wave", "fire", "ice", "sauce", "drip"
✗ Pronouns or filler: "yeah", "okay", "uh", "ah", "oh", "no"

RULE 2 — ALWAYS TRANSLATE TO THE VISUAL VIBE:
The keyword must describe what a BACKGROUND IMAGE should look like, not what the word literally means.
Examples:
• "side bitch"          → "nightclub woman"     (NOT "female dog")
• "pull up in the Ghost"→ "Rolls Royce luxury"  (Ghost = Rolls-Royce Phantom, not a spirit)
• "she bad"             → "confident woman"     (NOT "villain")
• "on fire"             → "stadium concert"     (NOT literal fire, unless it IS fire)
• "drip"                → "luxury fashion"      (NOT water dripping)
• "ice on my wrist"     → "diamond watch"       (translate slang → literal object)
• "run the city"        → "city skyline night"
• "catching feelings"   → "couple romance"
• "lean" (drug)         → "neon city"           (the nightlife aesthetic, not the substance)

RULE 3 — GENRE AWARENESS (match visuals to the music's world):
• Hip-hop / Trap  → luxury cars, penthouse, jewelry, champagne, streetwear, studio, club
• R&B             → moody lighting, couple, candlelight, city rain, velvet, late night bar
• Pop             → pastel colors, sunset beach, confetti, dancing crowd, rooftop party
• Rock / Metal    → electric guitar, stage lights, dark arena, crowd mosh, smoke machine
• Love song       → sunset, flowers, intimate moment, warm light, holding hands
• Heartbreak      → empty street rain, silhouette window, dark bedroom, cigarette smoke
• Motivational    → mountain peak, sunrise, championship trophy, running track, fist pump

RULE 4 — KEYWORD QUALITY:
• Cinematically specific: "penthouse rooftop" not just "building"
• 1-2 words maximum
• NEVER repeat the same keyword twice in the same song
• Each phrase must get a visually distinct image
• Think: what would a professional music video director cut to here?

══════════════════════════════════════════════
PHRASE RULES
══════════════════════════════════════════════
• One complete lyrical thought per phrase (a full line, not half a line)
• Repeated chorus lines each get their own separate entry
• Maximum ~10 words per phrase
• Cover ALL the lyrics — no lines skipped, no gaps`;


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
