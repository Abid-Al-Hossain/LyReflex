import { LyricMoment } from "@/types";

/* ─── Stop-word list ─────────────────────────────────────── */
const STOP = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","was","are","were","be","been","have","has","had","do","does",
  "did","will","would","could","should","may","might","i","you","he","she",
  "we","they","me","him","her","us","them","my","your","his","their","our",
  "this","that","it","its","not","no","so","if","as","all","up","out","oh",
  "yeah","know","get","got","im","ive","dont","cant","wont","just","then",
  "when","there","here","what","who","how","like","cause","gonna","wanna",
  "still","into","about","some","more","she","come","coming","let","back",
]);

/** Extract 1-2 meaningful nouns/verbs from a phrase */
export function extractKeyword(phrase: string): string {
  const words = phrase
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

  // Prefer longer words (more descriptive)
  words.sort((a, b) => b.length - a.length);
  return words.slice(0, 2).join(" ") || "abstract nature";
}

/* ─── Whisper chunk type ─────────────────────────────────── */
export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

/**
 * Group Whisper word-chunks into lyric phrases.
 * Breaks on punctuation OR every `groupSize` words.
 */
export function groupChunksIntoPhrases(
  chunks: WhisperChunk[],
  groupSize = 5
): LyricMoment[] {
  const phrases: LyricMoment[] = [];
  let group: WhisperChunk[] = [];

  const flush = () => {
    if (!group.length) return;
    const text      = group.map((c) => c.text).join("").trim();
    const startTime = group[0].timestamp[0] ?? 0;
    const endTime   =
      group[group.length - 1].timestamp[1] ??
      group[group.length - 1].timestamp[0] + 2;

    phrases.push({
      text,
      startTime,
      endTime,
      keyword: extractKeyword(text),
    });
    group = [];
  };

  for (const chunk of chunks) {
    group.push(chunk);
    const last = chunk.text.trim();
    const endsPhrase = /[,\.!\?;:]$/.test(last) || group.length >= groupSize;
    if (endsPhrase) flush();
  }
  flush(); // remaining words

  return phrases;
}

/** Decode audio file to mono Float32Array at 16 kHz (Whisper's required format) */
export async function decodeAudioTo16kHz(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  // Decode at 16 kHz directly to avoid resampling maths
  const ctx    = new AudioContext({ sampleRate: 16_000 });
  const buffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();
  // Downmix to mono by averaging all channels
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) mono[i] += data[i];
  }
  for (let i = 0; i < mono.length; i++) mono[i] /= buffer.numberOfChannels;
  return mono;
}
