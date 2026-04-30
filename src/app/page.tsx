"use client";

import { useState, useCallback, useRef } from "react";
import Navbar        from "@/components/Navbar";
import Uploader      from "@/components/Uploader";
import Visualizer    from "@/components/Visualizer";
import AudioPlayer   from "@/components/AudioPlayer";
import GroqKeyModal, { useGroqKey } from "@/components/GroqKeyModal";
import { LyricMoment, AppState } from "@/types";
import { fetchImage, preCacheImage, clearImageCache } from "@/lib/imageService";
import { groupChunksIntoPhrases, WhisperChunk } from "@/lib/lyrics";
import { transcribeAudio, TranscriptWord } from "@/lib/transcription";

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url   = URL.createObjectURL(file);
    audio.src   = url;
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration); };
    audio.onerror          = ()  => { URL.revokeObjectURL(url); resolve(240); };
  });
}

function toChunks(words: TranscriptWord[]): WhisperChunk[] {
  return words.map((w) => ({
    text:      ` ${w.word}`,
    timestamp: [w.start, w.end] as [number, number | null],
  }));
}

export default function Home() {
  const [appState,     setAppState]     = useState<AppState>("upload");
  const [audioFile,    setAudioFile]    = useState<File | null>(null);
  const [audioSrc,     setAudioSrc]     = useState<string | null>(null);
  const [lyrics,       setLyrics]       = useState<LyricMoment[]>([]);
  const [currentLyric, setCurrentLyric] = useState<LyricMoment | null>(null);
  const [statusMsg,    setStatusMsg]    = useState("Starting…");
  const [showKeyModal, setShowKeyModal] = useState(false);

  /* Groq key from localStorage */
  const { key: groqKey, setKey: setGroqKey } = useGroqKey();

  /* A/B crossfade */
  const [layerA,      setLayerA]      = useState<string | null>(null);
  const [layerB,      setLayerB]      = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<"a" | "b">("a");
  const activeLayerRef = useRef<"a" | "b">("a");
  const lastLyricRef   = useRef<LyricMoment | null>(null);
  const lyricsRef      = useRef<LyricMoment[]>([]);

  /* ── File selected ──────────────────────────────────────────────────────── */
  const handleFileSelect = useCallback(async (file: File) => {
    setAudioFile(file);
    setAudioSrc(URL.createObjectURL(file));
    setAppState("processing");
    setStatusMsg("Reading audio…");
    clearImageCache();
    lastLyricRef.current   = null;
    activeLayerRef.current = "a";
    setActiveLayer("a");
    setLayerA(null);
    setLayerB(null);
    lyricsRef.current = [];

    try {
      const duration = await getAudioDuration(file);

      /* Read key from localStorage at call time (most up-to-date) */
      const lsKey = typeof window !== "undefined"
        ? localStorage.getItem("lyreflex_groq_key") ?? undefined
        : undefined;

      const words = await transcribeAudio(file, duration, setStatusMsg, lsKey);

      setStatusMsg("Building visual timeline…");
      const chunks  = toChunks(words);
      let phrases   = groupChunksIntoPhrases(chunks, 5);

      /* Scale timestamps to full song if needed */
      const lastPhrase = phrases[phrases.length - 1];
      if (lastPhrase && lastPhrase.endTime < duration * 0.9) {
        const scale = duration / lastPhrase.endTime;
        phrases = phrases.map((p) => ({
          ...p,
          startTime: p.startTime * scale,
          endTime:   p.endTime   * scale,
        }));
      }

      setStatusMsg(`Generating AI visuals for ${phrases.length} moments…`);
      const enriched = await Promise.all(
        phrases.map(async (p, idx) => {
          const url = await fetchImage(p.keyword).catch(() => "");
          // Await the very first image so the initial screen isn't blank
          if (url && idx === 0) {
            await preCacheImage(url);
          } else if (url) {
            preCacheImage(url); // Let others load in background
          }
          return { ...p, imageUrl: url };
        })
      );

      lyricsRef.current = enriched;
      setLyrics(enriched);

      const first = enriched.find((e) => e.imageUrl);
      if (first?.imageUrl) {
        setLayerA(first.imageUrl);
        activeLayerRef.current = "a";
        setActiveLayer("a");
      }

      setAppState("playing");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg(`Error: ${msg}`);
    }
  }, []);

  /* ── Sync engine ─────────────────────────────────────────────────────────── */
  const handleTimeUpdate = useCallback((time: number) => {
    const lyric =
      lyricsRef.current.find((l) => time >= l.startTime && time <= l.endTime) ?? null;

    if (lyric && lyric !== lastLyricRef.current) {
      lastLyricRef.current = lyric;
      setCurrentLyric(lyric);
      if (lyric.imageUrl) {
        if (activeLayerRef.current === "a") {
          setLayerB(lyric.imageUrl);
          setActiveLayer("b");
          activeLayerRef.current = "b";
        } else {
          setLayerA(lyric.imageUrl);
          setActiveLayer("a");
          activeLayerRef.current = "a";
        }
      }
    } else if (!lyric && lastLyricRef.current) {
      lastLyricRef.current = null;
      setCurrentLyric(null);
    }
  }, []);

  /* ── Reset ──────────────────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    setAppState("upload");
    setAudioFile(null);
    setAudioSrc(null);
    setLyrics([]);
    setCurrentLyric(null);
    setLayerA(null);
    setLayerB(null);
    setActiveLayer("a");
    activeLayerRef.current = "a";
    lastLyricRef.current   = null;
    lyricsRef.current      = [];
    clearImageCache();
  }, []);

  /* ── Upload screen ──────────────────────────────────────────────────────── */
  if (appState === "upload") {
    return (
      <div className="page-wrapper">
        <Navbar onKeyClick={() => setShowKeyModal(true)} groqKeySet={!!groqKey} />
        <Uploader onUpload={handleFileSelect} />

        {/* Groq callout banner */}
        <div className="groq-banner">
          {groqKey ? (
            <>
              <span className="groq-dot groq-dot--active" />
              <span>⚡ Groq active — instant transcription</span>
              <button className="groq-btn-link" onClick={() => setShowKeyModal(true)}>
                Manage key
              </button>
            </>
          ) : (
            <>
              <span className="groq-dot" />
              <span>Add a free Groq key for instant results</span>
              <button className="groq-btn-link" onClick={() => setShowKeyModal(true)}>
                Set up →
              </button>
            </>
          )}
        </div>

        {showKeyModal && (
          <GroqKeyModal
            onClose={() => setShowKeyModal(false)}
            onSave={(k) => setGroqKey(k)}
          />
        )}
      </div>
    );
  }

  /* ── Processing screen ──────────────────────────────────────────────────── */
  if (appState === "processing") {
    return (
      <div className="page-wrapper">
        <Navbar />
        <div className="hero-screen">
          <div className="proc-card glass-md anim-scale-in">
            <div className="proc-icon">🎙️</div>
            <p className="proc-title">Analysing your track…</p>
            <p className="proc-msg">{statusMsg}</p>
            <div className="proc-spinner" />
            <p className="proc-note">
              {groqKey
                ? "⚡ Groq Whisper Large v3 — completes in ~2 seconds."
                : "Using HuggingFace Whisper (free, ~15–30 s). Add a Groq key for instant results."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Playing screen ─────────────────────────────────────────────────────── */
  return (
    <div className="player-view">
      <Visualizer
        imageA={layerA}
        imageB={layerB}
        activeLayer={activeLayer}
        currentText={currentLyric?.text ?? null}
        isProcessing={false}
      />
      <div className="player-navbar">
        <Navbar onKeyClick={() => setShowKeyModal(true)} groqKeySet={!!groqKey} />
      </div>
      {audioSrc && (
        <div className="player-dock">
          <AudioPlayer
            src={audioSrc}
            fileName={audioFile?.name ?? ""}
            onTimeUpdate={handleTimeUpdate}
            onReset={handleReset}
          />
        </div>
      )}
      {showKeyModal && (
        <GroqKeyModal
          onClose={() => setShowKeyModal(false)}
          onSave={(k) => setGroqKey(k)}
        />
      )}
    </div>
  );
}
