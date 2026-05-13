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

const SYSTEM_PROMPT = `You are a world-class music video creative director and AI visual curator.
Your task: analyze song lyrics, identify the song's visual world, then assign perfect image search keywords to each phrase.

## STEP 1 — THINK FIRST (internal reasoning, not in output)
Before writing any JSON, ask yourself:
- What song and artist is this? (use your training knowledge)
- What genre? (Dark R\u0026B, Trap, Pop, Rock, Afrobeats, Latin, etc.)
- What is the song's VISUAL AESTHETIC? (color palette, setting, mood, music video style)
- What visual themes recur throughout this song?
Keep this "visual world" locked in your mind. EVERY keyword must fit within it.

## STEP 2 — OUTPUT FORMAT
Return ONLY a raw JSON array. Zero markdown. Zero explanation. No code fences.
[{"text":"exact lyric phrase","keyword":"2-3 word search term"},...]

## KEYWORD RULES (non-negotiable)

### NEVER output these in any keyword:
- Profanity or slurs of any kind
- Raw slang as a literal term: ghost, ice, fire, drip, sauce, wave, lit, heat, smoke, plug
- Generic standalone words: love, night, day, man, woman, good, bad, life, world, god
- Filler/onomatopoeia: yeah, okay, uh, oh, ah, whoa, no, hey

### ALWAYS translate slang to the REAL visual it represents:
| Lyric contains | Use keyword instead |
|----------------|--------------------|
| ice / froze / frozen (jewelry) | diamond watch / diamond chain |
| ghost / wraith / phantom (car) | Rolls Royce phantom |
| whip / ride / foreign | luxury sports car |
| racks / bands / bread / paper | stack of cash |
| drip / sauce / swag / steeze | designer fashion |
| strapped / heat / blick (weapon) | tense confrontation |
| red lamps / all red (Starboy) | red neon luxury |
| church shoes / cleaner (bragging style) | polished dress shoes |
| belly / tease (Starboy context) | dark penthouse |
| she bad / shorty / wifey | glamorous woman |

### GENRE VISUAL PALETTE (match ALL keywords to the song's genre):
- Dark R\u0026B (Weeknd, Frank Ocean): red neon, dark penthouse, luxury isolation, cigarette smoke, moody
- Trap/Hip-hop: Rolls Royce, designer outfit, diamond chain, champagne toast, recording studio
- Pop (upbeat): colorful confetti, sunset beach, rooftop crowd, neon sign, glitter
- Pop (sad/indie): empty cafe, autumn leaves, rain window, silhouette fog, polaroid photo
- Rock/Alternative: concert smoke, guitar amp, leather jacket, crowd mosh, dark stage
- Latin/Reggaeton: tropical beach, carnival dance, vibrant street, palm trees, salsa
- Afrobeats: golden beach, colorful fabric, street market, outdoor dance, sunset Africa
- Motivational/Rap: trophy podium, sunrise skyline, fist raised, mountain summit, stadium

### KEYWORD QUALITY CHECKLIST:
✓ 2-3 words maximum
✓ Concrete and searchable (works as a stock photo or GIF search)
✓ Fits BOTH the specific lyric AND the song's overall aesthetic
✓ Visually DISTINCT from every other keyword in the song (no repetition)
✓ Would produce a beautiful, cinematic background image

## FEW-SHOT EXAMPLES

### Example: "Starboy" by The Weeknd (Dark R\u0026B / Post-pop — visual world: red neon, luxury, dark isolation)
Input phrase → keyword
- "I'm a motherf***ing starboy" → "celebrity dark neon"
- "All red lamps to tease you" → "red neon luxury" (lamps = decorative, not traffic)
- "P1 cleaner than your church shoes" → "mclaren sports car" (P1 = McLaren P1 hypercar)
- "Belly point to just to hurt you" → "penthouse confrontation"
- "Side bitch out of your loop" → "nightclub woman"
- "Spent to tease" → "luxury shopping bags"
- "Made your whole year in a week" → "stacks of money"
- "I got a house that I feel safe in" → "modern mansion interior"
- "House so empty need a centerpiece" → "luxury empty room"

### Example: "We Don't Talk Anymore" by Charlie Puth (Sad Pop — visual world: muted tones, distance, longing)
- "We don't talk anymore" → "couple distant silence"
- "I just heard you found someone" → "woman alone window"
- "Like we used to do" → "faded polaroid photo"
- "Are you happy now?" → "sad silhouette rain"

### Example: "God's Plan" by Drake (Hip-hop — visual world: community, wealth, giving, Miami)
- "I been movin' calm, don't start no trouble" → "calm wealthy man"
- "She say do you love me, I tell her only partly" → "couple rooftop Miami"
- "God's plan" → "divine light breakthrough"
- "I hold back sometimes" → "man alone penthouse"

## PHRASE GROUPING RULES (critical — how subtitles must work)

Think of how Netflix or YouTube subtitles work:
- Each subtitle line contains a COMPLETE, MEANINGFUL thought — never a fragment
- Minimum 5 words per phrase. NEVER output a phrase with 1, 2, 3, or 4 words.
- If a lyric section has short repeated words ("up, down, up, down"), group them ALL into ONE phrase: "move it up down up throttle"
- Maximum ~12 words per phrase
- Each phrase covers at least 2-3 seconds of audio
- Repeated chorus lines: group the WHOLE chorus line as one phrase, not word by word
- NEVER split a natural speech unit in half
- Cover ALL the audio — no gaps, no skipped sections

BAD (never do this):
[{"text": "Move it", ...}, {"text": "up,", ...}, {"text": "down,", ...}]

GOOD (correct grouping like real subtitles):
[{"text": "Move it up, down, up, throttle", ...}]`;


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
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `First, identify the song and its visual aesthetic in your mind (do not output this step). Then output the JSON array.

Lyrics:
${fullText}`,
          },
        ],
        max_tokens: 4096,
        temperature: 0.15,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      console.warn(`[LyReflex] Groq phrase detection failed: ${res.status}`);
      return fallback(words);
    }

    const data    = await res.json();
    const content = (data.choices?.[0]?.message?.content ?? "") as string;

    // Robust JSON extraction: the 70B model sometimes outputs reasoning
    // text or explanations before/after the JSON array. We find the
    // outermost [...] to extract just the JSON, ignoring surrounding text.
    const firstBracket = content.indexOf("[");
    const lastBracket  = content.lastIndexOf("]");
    const cleaned = firstBracket !== -1 && lastBracket > firstBracket
      ? content.slice(firstBracket, lastBracket + 1)
      : content.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();

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

/* ── Timestamp alignment (proportional) ──────────────────────────────────── */
/**
 * Maps each LLM phrase to Whisper word timestamps proportionally.
 * Proportional is more stable than text-matching for songs where Whisper
 * frequently transcribes words differently from the actual lyrics.
 */
function alignPhrasesToWords(
  phrases:      RawPhrase[],
  words:        TranscriptWord[],
  songDuration: number
): LyricMoment[] {
  const phraseWordCounts = phrases.map((p) =>
    p.text.trim().split(/\s+/).filter(Boolean).length
  );
  const totalPhraseWords = phraseWordCounts.reduce((a, b) => a + b, 0);
  const totalTransWords  = words.length;

  const raw: LyricMoment[] = [];
  let wordIdx = 0;

  for (let pi = 0; pi < phrases.length; pi++) {
    const phrase    = phrases[pi];
    const rawCount  = phraseWordCounts[pi];
    const scaled    = Math.max(1, Math.round((rawCount / totalPhraseWords) * totalTransWords));
    const clampedEnd = Math.min(wordIdx + scaled - 1, words.length - 1);

    const startTime = words[wordIdx]?.start ?? 0;
    const endTime   =
      pi === phrases.length - 1
        ? songDuration
        : (words[Math.min(wordIdx + scaled, words.length - 1)]?.start ?? songDuration);

    raw.push({
      text:      phrase.text.trim(),
      keyword:   ((phrase.keyword ?? "").trim().toLowerCase() || extractKeyword(phrase.text)),
      startTime: Math.max(0, startTime),
      endTime:   Math.min(songDuration, Math.max(startTime + 0.5, endTime)),
      imageUrl:  "",
    });

    wordIdx = Math.min(clampedEnd + 1, words.length - 1);
  }

  if (raw.length > 0) raw[raw.length - 1].endTime = songDuration;

  // Post-process: merge any phrase that is too short (< 5 words or < 2.5s)
  // into the NEXT phrase so single-word subtitles are physically impossible.
  return mergeShortPhrases(raw, songDuration);
}

/* ── Short phrase merger ──────────────────────────────────────────────────── */
const MIN_WORDS    = 5;   // minimum words in a subtitle phrase
const MIN_DURATION = 2.5; // minimum seconds a phrase is shown

function mergeShortPhrases(phrases: LyricMoment[], songDuration: number): LyricMoment[] {
  if (phrases.length === 0) return [];

  const out: LyricMoment[] = [];

  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    const wordCount = p.text.trim().split(/\s+/).filter(Boolean).length;
    const duration  = p.endTime - p.startTime;

    // If this phrase is long enough, keep it
    if (wordCount >= MIN_WORDS && duration >= MIN_DURATION) {
      out.push(p);
      continue;
    }

    // Too short — merge into last accumulated phrase if possible
    if (out.length > 0) {
      const last = out[out.length - 1];
      out[out.length - 1] = {
        ...last,
        text:    `${last.text} ${p.text}`.trim(),
        endTime: p.endTime,
      };
    } else {
      // No previous phrase to merge into — keep as-is (edge case: first phrase)
      out.push(p);
    }
  }

  if (out.length > 0) out[out.length - 1].endTime = songDuration;
  return out.filter((r) => r.endTime > r.startTime);
}

/* ── Fallback: dumb 5-word grouper ───────────────────────────────────────── */
function fallback(words: TranscriptWord[]): LyricMoment[] {
  const chunks = words.map((w) => ({
    text:      ` ${w.word}`,
    timestamp: [w.start, w.end] as [number, number | null],
  }));
  return groupChunksIntoPhrases(chunks, 5);
}
