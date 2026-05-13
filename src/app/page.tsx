"use client";

import { useState, useCallback, useRef } from "react";
import Navbar        from "@/components/Navbar";
import Uploader      from "@/components/Uploader";
import Visualizer    from "@/components/Visualizer";
import AudioPlayer   from "@/components/AudioPlayer";
import GroqKeyModal, { useGroqKey } from "@/components/GroqKeyModal";
import { LyricMoment, AppState, VisualMode } from "@/types";
import { fetchVisual, clearMediaCache } from "@/lib/imageService";
import { getSemanticPhrases } from "@/lib/phraseService";
import { transcribeAudio, TranscriptWord } from "@/lib/transcription";

/* ─── Constants ───────────────────────────────────────────────────────────── */
/**
 * How many seconds ahead of a phrase's startTime we begin loading its visual.
 * 15s gives enough time to fetch even slow Wikipedia images.
 * Fully time-driven — works for both slow ballads and fast rap.
 */
const LOOKAHEAD_SECS = 15;

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

/* ─────────────────────────────────────────────────────────────────────────── */

export default function Home() {
  const [appState,     setAppState]     = useState<AppState>("upload");
  const [audioFile,    setAudioFile]    = useState<File | null>(null);
  const [audioSrc,     setAudioSrc]     = useState<string | null>(null);
  const [lyrics,       setLyrics]       = useState<LyricMoment[]>([]);
  const [currentLyric, setCurrentLyric] = useState<LyricMoment | null>(null);
  const [statusMsg,    setStatusMsg]    = useState("Starting…");
  const [showKeyModal, setShowKeyModal] = useState(false);

  /* Visual mode — persisted in state, user toggles before upload */
  const [visualMode, setVisualMode] = useState<VisualMode>("gif");
  const visualModeRef = useRef<VisualMode>("gif");

  /* Groq key from localStorage */
  const { key: groqKey, setKey: setGroqKey } = useGroqKey();

  /* A/B crossfade layers */
  const [layerA,      setLayerA]      = useState<string | null>(null);
  const [layerB,      setLayerB]      = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<"a" | "b">("a");
  const activeLayerRef = useRef<"a" | "b">("a");
  const lastLyricRef   = useRef<LyricMoment | null>(null);
  const lyricsRef      = useRef<LyricMoment[]>([]);

  /* Rolling loader state */
  const isLoadingRef = useRef<boolean>(false);
  const loadedSetRef = useRef<Set<number>>(new Set());

  /* ── Mode toggle handler ─────────────────────────────────────────────────── */
  const handleModeChange = useCallback((mode: VisualMode) => {
    setVisualMode(mode);
    visualModeRef.current = mode;
  }, []);

  /* ── Visual loader helper ────────────────────────────────────────────────── */
  const loadVisualForIndex = useCallback(async (index: number): Promise<void> => {
    const phrases = lyricsRef.current;
    if (index >= phrases.length) return;
    if (loadedSetRef.current.has(index)) return;

    loadedSetRef.current.add(index);

    const keyword = phrases[index].keyword;
    const mode    = visualModeRef.current;
    const url     = await fetchVisual(keyword, mode).catch(() => "");

    if (url) {
      const updated = [...lyricsRef.current];
      updated[index] = { ...updated[index], imageUrl: url };
      lyricsRef.current = updated;
      setLyrics([...updated]);

      // Set initial background from the very first visual
      if (!layerA) {
        setLayerA(url);
        activeLayerRef.current = "a";
        setActiveLayer("a");
      }
    }
  }, [layerA]);

  /* ── File selected ──────────────────────────────────────────────────────── */
  const handleFileSelect = useCallback(async (file: File) => {
    setAudioFile(file);
    setAudioSrc(URL.createObjectURL(file));
    setAppState("processing");
    setStatusMsg("Reading audio…");
    clearMediaCache();
    lastLyricRef.current   = null;
    activeLayerRef.current = "a";
    isLoadingRef.current   = false;
    loadedSetRef.current   = new Set();
    setActiveLayer("a");
    setLayerA(null);
    setLayerB(null);
    setLyrics([]);
    lyricsRef.current = [];

    try {
      const duration = await getAudioDuration(file);

      const lsKey = typeof window !== "undefined"
        ? localStorage.getItem("lyreflex_groq_key") ?? undefined
        : undefined;

      /* ── Step 1: Transcribe ──────────────────────────────────────────────── */
      const words: TranscriptWord[] = await transcribeAudio(file, duration, setStatusMsg, lsKey);

      /* ── Step 2: Semantic phrase detection (ONE Groq LLM call) ─────────── */
      setStatusMsg("Analysing lyrics…");
      const phrases = await getSemanticPhrases(words, lsKey ?? null, duration);

      lyricsRef.current = phrases;
      setLyrics([...phrases]);

      /* ── Step 3: Pre-load first visual ───────────────────────────────────── */
      const modeLabel = visualModeRef.current === "gif" ? "GIF" : "image";
      setStatusMsg(`Loading first ${modeLabel}…`);
      await loadVisualForIndex(0);

      /* ── Step 4: Show player — time-driven loader takes over ─────────────── */
      setAppState("playing");
      setStatusMsg("");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg(`Error: ${msg}`);
    }
  }, [loadVisualForIndex]);

  /* ── Sync engine — runs on every audio tick (~4× per second) ──────────── */
  const handleTimeUpdate = useCallback((time: number) => {
    const phrases = lyricsRef.current;

    /* ── 1. Lyric sync + crossfade ─────────────────────────────────────── */
    const lyric = phrases.find((l) => time >= l.startTime && time <= l.endTime) ?? null;

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

    /* ── 2. Rolling loader — driven by audio timestamp ─────────────────── */
    if (!isLoadingRef.current) {
      const target = phrases.find(
        (p, i) =>
          p.startTime > time &&
          p.startTime - time <= LOOKAHEAD_SECS &&
          !loadedSetRef.current.has(i)
      );

      if (target) {
        const idx = phrases.indexOf(target);
        isLoadingRef.current = true;
        loadVisualForIndex(idx).then(() => {
          isLoadingRef.current = false;
        });
      }
    }
  }, [loadVisualForIndex]);

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
    isLoadingRef.current   = false;
    loadedSetRef.current   = new Set();
    clearMediaCache();
  }, []);

  /* ── Upload screen ──────────────────────────────────────────────────────── */
  if (appState === "upload") {
    return (
      <div className="page-wrapper">
        <Navbar onKeyClick={() => setShowKeyModal(true)} groqKeySet={!!groqKey} />
        <Uploader onUpload={handleFileSelect} />

        {/* Visual mode toggle */}
        <div className="mode-toggle-wrap">
          <span className="mode-toggle-label">Visual style</span>
          <div className="mode-toggle">
            <button
              className={`mode-btn ${visualMode === "gif" ? "mode-btn--active" : ""}`}
              onClick={() => handleModeChange("gif")}
            >
              <span className="mode-icon">🎞️</span> GIFs
            </button>
            <button
              className={`mode-btn ${visualMode === "image" ? "mode-btn--active" : ""}`}
              onClick={() => handleModeChange("image")}
            >
              <span className="mode-icon">🖼️</span> Images
            </button>
          </div>
        </div>

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
