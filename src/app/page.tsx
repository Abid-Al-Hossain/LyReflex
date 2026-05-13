"use client";

import { useState, useCallback, useRef } from "react";
import Navbar        from "@/components/Navbar";
import Uploader      from "@/components/Uploader";
import Visualizer    from "@/components/Visualizer";
import AudioPlayer   from "@/components/AudioPlayer";
import ApiKeysModal, { useApiKeys } from "@/components/GroqKeyModal";
import { LyricMoment, AppState, VisualMode } from "@/types";
import { fetchVisual, clearMediaCache } from "@/lib/imageService";
import { getSemanticPhrases } from "@/lib/phraseService";
import { transcribeAudio, TranscriptWord } from "@/lib/transcription";

/* ─── Constants ───────────────────────────────────────────────────────────── */
const LOOKAHEAD_SECS = 15;
/**
 * Minimum time-jump (seconds) that counts as a user seek vs normal playback.
 * audio.timeupdate fires every ~250ms, so normal drift is max ~0.3s.
 */
const SEEK_THRESHOLD = 1.5;

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

/**
 * Preload a media URL (image or GIF) into the browser's decode cache.
 * Returns as soon as the first frame is ready — no flash on display.
 * Times out after 4s so we never block indefinitely on a slow GIF.
 */
function preloadMedia(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const timer = setTimeout(resolve, 4000); // max wait
    img.onload = img.onerror = () => { clearTimeout(timer); resolve(); };
    img.src = url;
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

  /* Visual mode */
  const [visualMode, setVisualMode] = useState<VisualMode>("gif");
  const visualModeRef = useRef<VisualMode>("gif");

  /* API keys */
  const { keys: apiKeys, reload: reloadKeys } = useApiKeys();

  /* A/B crossfade layers */
  const [layerA,      setLayerA]      = useState<string | null>(null);
  const [layerB,      setLayerB]      = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<"a" | "b">("a");
  const activeLayerRef          = useRef<"a" | "b">("a");
  const lastLyricRef            = useRef<LyricMoment | null>(null);
  const lyricsRef               = useRef<LyricMoment[]>([]);

  /* Rolling loader — tracks which indices are currently in-flight */
  const inFlightRef             = useRef<Set<number>>(new Set());
  const loadedSetRef            = useRef<Set<number>>(new Set());

  /* FIX 1: Track the index of the CURRENTLY PLAYING phrase.
     Used by loadVisualForIndex to crossfade immediately when the active
     phrase's image arrives (e.g. after a seek to an unloaded section). */
  const currentPhraseIdxRef     = useRef<number>(-1);

  /* FIX 2: Detect seeks. Track the last reported audio time. */
  const lastTimeRef             = useRef<number>(-1);

  /* FIX 3: Remove [layerA] dep from loadVisualForIndex.
     Use a plain ref flag instead so the callback is stable. */
  const hasInitialImageRef      = useRef<boolean>(false);

  /* ── Crossfade helper (pure side-effect, no state deps) ─────────────────── */
  const crossfadeTo = useCallback((url: string) => {
    if (activeLayerRef.current === "a") {
      setLayerB(url);
      setActiveLayer("b");
      activeLayerRef.current = "b";
    } else {
      setLayerA(url);
      setActiveLayer("a");
      activeLayerRef.current = "a";
    }
  }, []);

  /* ── Mode toggle ─────────────────────────────────────────────────────────── */
  const handleModeChange = useCallback((mode: VisualMode) => {
    setVisualMode(mode);
    visualModeRef.current = mode;
  }, []);

  /* ── Visual loader ───────────────────────────────────────────────────────── */
  const loadVisualForIndex = useCallback(async (index: number): Promise<void> => {
    const phrases = lyricsRef.current;
    if (index >= phrases.length) return;
    if (loadedSetRef.current.has(index)) return;

    loadedSetRef.current.add(index);

    const keyword = phrases[index].keyword;
    const mode    = visualModeRef.current;
    const url     = await fetchVisual(keyword, mode).catch(() => "");
    if (!url) return;

    /* FIX 4: Preload into browser decode cache BEFORE touching any state.
       This ensures the <img> element renders instantly without a flash. */
    await preloadMedia(url);

    /* Store in lyricsRef */
    const updated = [...lyricsRef.current];
    updated[index] = { ...updated[index], imageUrl: url };
    lyricsRef.current = updated;
    setLyrics([...updated]);

    /* Set first-ever background */
    if (!hasInitialImageRef.current) {
      hasInitialImageRef.current = true;
      setLayerA(url);
      activeLayerRef.current = "a";
      setActiveLayer("a");
      return;
    }

    /* FIX 1: If THIS phrase is currently active (e.g. we just seeked here
       and the image wasn't loaded yet), crossfade to it immediately.
       Without this, the player keeps showing the stale image until the
       next phrase boundary is crossed. */
    if (index === currentPhraseIdxRef.current) {
      crossfadeTo(url);
    }
  }, [crossfadeTo]);

  /* ── File selected ──────────────────────────────────────────────────────── */
  const handleFileSelect = useCallback(async (file: File) => {
    setAudioFile(file);
    setAudioSrc(URL.createObjectURL(file));
    setAppState("processing");
    setStatusMsg("Reading audio…");
    clearMediaCache();

    /* Full reset of all refs */
    lastLyricRef.current         = null;
    activeLayerRef.current       = "a";
    inFlightRef.current          = new Set();
    loadedSetRef.current         = new Set();
    currentPhraseIdxRef.current  = -1;
    lastTimeRef.current          = -1;
    hasInitialImageRef.current   = false;

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

      setStatusMsg("Transcribing audio…");
      const words: TranscriptWord[] = await transcribeAudio(file, duration, setStatusMsg, lsKey);

      setStatusMsg("Analysing lyrics…");
      const phrases = await getSemanticPhrases(words, lsKey ?? null, duration);

      lyricsRef.current = phrases;
      setLyrics([...phrases]);

      const modeLabel = visualModeRef.current === "gif" ? "GIF" : "image";
      setStatusMsg(`Loading first ${modeLabel}…`);
      await loadVisualForIndex(0);

      setAppState("playing");
      setStatusMsg("");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg(`Error: ${msg}`);
    }
  }, [loadVisualForIndex]);

  /* ── Sync engine ─────────────────────────────────────────────────────────── */
  const handleTimeUpdate = useCallback((time: number) => {
    const phrases = lyricsRef.current;
    const prev    = lastTimeRef.current;
    lastTimeRef.current = time;

    /* FIX 2: Seek detection.
       If the audio jumped more than SEEK_THRESHOLD seconds,
       the user clicked/dragged the progress bar.
       → Reset isLoadingRef so we don't stay blocked on an in-flight
         load that's now irrelevant.
       → Null lastLyricRef to force re-evaluation at the new position. */
    if (prev >= 0 && Math.abs(time - prev) > SEEK_THRESHOLD) {
      inFlightRef.current.clear(); // abandon stale in-flight loads
      lastLyricRef.current  = null;
    }

    /* ── 1. Find current phrase ───────────────────────────────────────────── */
    const lyricIdx = phrases.findIndex((l) => time >= l.startTime && time <= l.endTime);
    const lyric    = lyricIdx >= 0 ? phrases[lyricIdx] : null;

    /* Always keep the current phrase index ref up to date */
    currentPhraseIdxRef.current = lyricIdx;

    if (lyric && lyric !== lastLyricRef.current) {
      lastLyricRef.current = lyric;
      setCurrentLyric(lyric);

      /* Crossfade only if the image is already loaded.
         If not, loadVisualForIndex will crossfade when it finishes (FIX 1). */
      if (lyric.imageUrl) {
        crossfadeTo(lyric.imageUrl);
      }
    } else if (!lyric && lastLyricRef.current) {
      lastLyricRef.current = null;
      setCurrentLyric(null);
    }

    /* ── 2. Rolling parallel loader ──────────────────────────────────────── */
    // Find ALL unloaded phrases within the lookahead window and start
    // loading them in parallel. Each phrase tracks itself via inFlightRef.
    phrases.forEach((p, i) => {
      if (
        p.startTime > time &&
        p.startTime - time <= LOOKAHEAD_SECS &&
        !loadedSetRef.current.has(i) &&
        !inFlightRef.current.has(i)
      ) {
        inFlightRef.current.add(i);
        loadVisualForIndex(i).then(() => {
          inFlightRef.current.delete(i);
        });
      }
    });
  }, [loadVisualForIndex, crossfadeTo]);

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
    activeLayerRef.current       = "a";
    lastLyricRef.current         = null;
    lyricsRef.current            = [];
    inFlightRef.current          = new Set();
    loadedSetRef.current         = new Set();
    currentPhraseIdxRef.current  = -1;
    lastTimeRef.current          = -1;
    hasInitialImageRef.current   = false;
    clearMediaCache();
  }, []);

  /* ── Upload screen ──────────────────────────────────────────────────────── */
  if (appState === "upload") {
    return (
      <div className="page-wrapper">
        <Navbar onKeyClick={() => setShowKeyModal(true)} groqKeySet={!!apiKeys.groq} />
        <Uploader onUpload={handleFileSelect} />

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

        <div className="groq-banner">
          <button className="groq-btn-link" onClick={() => setShowKeyModal(true)}>
            🔑 Manage API Keys
          </button>
          <span>—</span>
          <span className={apiKeys.groq    ? "key-indicator key-indicator--on" : "key-indicator"}>⚡ Groq {apiKeys.groq    ? "✓" : "✗"}</span>
          <span className={apiKeys.giphy   ? "key-indicator key-indicator--on" : "key-indicator"}>🎞️ Giphy {apiKeys.giphy   ? "✓" : "✗"}</span>
          <span className={apiKeys.pixabay ? "key-indicator key-indicator--on" : "key-indicator"}>🖼️ Pixabay {apiKeys.pixabay ? "✓" : "✗"}</span>
        </div>

        {showKeyModal && (
          <ApiKeysModal onClose={() => setShowKeyModal(false)} onSave={reloadKeys} />
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
              {apiKeys.groq
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
        <Navbar onKeyClick={() => setShowKeyModal(true)} groqKeySet={!!apiKeys.groq} />
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
        <ApiKeysModal onClose={() => setShowKeyModal(false)} onSave={reloadKeys} />
      )}
    </div>
  );
}
