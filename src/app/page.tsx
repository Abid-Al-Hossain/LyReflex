"use client";

import { useState, useCallback, useRef } from "react";
import Navbar        from "@/components/Navbar";
import Uploader      from "@/components/Uploader";
import Visualizer    from "@/components/Visualizer";
import AudioPlayer   from "@/components/AudioPlayer";
import GroqKeyModal, { useGroqKey } from "@/components/GroqKeyModal";
import { LyricMoment, AppState } from "@/types";
import { fetchImage, clearImageCache } from "@/lib/imageService";
import { getSemanticPhrases } from "@/lib/phraseService";
import { transcribeAudio, TranscriptWord } from "@/lib/transcription";

/* ─── Constants ───────────────────────────────────────────────────────────── */
/**
 * How many seconds ahead of a phrase's startTime we begin loading its image.
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

  /* Groq key from localStorage */
  const { key: groqKey, setKey: setGroqKey } = useGroqKey();

  /* A/B crossfade layers */
  const [layerA,      setLayerA]      = useState<string | null>(null);
  const [layerB,      setLayerB]      = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<"a" | "b">("a");
  const activeLayerRef = useRef<"a" | "b">("a");
  const lastLyricRef   = useRef<LyricMoment | null>(null);
  const lyricsRef      = useRef<LyricMoment[]>([]);

  /* Rolling image loader — tracks which phrase is currently being fetched */
  const isLoadingRef   = useRef<boolean>(false);
  /** Set of phrase indices currently in-flight or already loaded */
  const loadedSetRef   = useRef<Set<number>>(new Set());

  /* ── Image loader helper ─────────────────────────────────────────────────── */
  const loadImageForIndex = useCallback(async (index: number): Promise<void> => {
    const phrases = lyricsRef.current;
    if (index >= phrases.length) return;
    if (loadedSetRef.current.has(index)) return; // already loaded or in-flight

    loadedSetRef.current.add(index); // mark in-flight immediately

    const keyword = phrases[index].keyword;
    const url     = await fetchImage(keyword).catch(() => "");

    if (url) {
      const updated = [...lyricsRef.current];
      updated[index] = { ...updated[index], imageUrl: url };
      lyricsRef.current = updated;
      setLyrics([...updated]);

      // Set the initial background layer from the very first image that arrives
      if (!layerA) {
        setLayerA(url);
        activeLayerRef.current = "a";
        setActiveLayer("a");
      }
    }
  }, [layerA]);

  /* ── File selected ──────────────────────────────────────────────────────── */
  const handleFileSelect = useCallback(async (file: File) => {
    // Reset everything
    setAudioFile(file);
    setAudioSrc(URL.createObjectURL(file));
    setAppState("processing");
    setStatusMsg("Reading audio…");
    clearImageCache();
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

      /* Read key from localStorage (most up-to-date at call time) */
      const lsKey = typeof window !== "undefined"
        ? localStorage.getItem("lyreflex_groq_key") ?? undefined
        : undefined;

      /* ── Step 1: Transcribe ──────────────────────────────────────────────── */
      const words: TranscriptWord[] = await transcribeAudio(file, duration, setStatusMsg, lsKey);

      /* ── Step 2: Semantic phrase detection (ONE Groq LLM call) ─────────── */
      setStatusMsg("Analysing lyrics…");
      const phrases = await getSemanticPhrases(words, lsKey ?? null, duration);

      // Store all phrases immediately (images empty for now)
      lyricsRef.current = phrases;
      setLyrics([...phrases]);

      /* ── Step 3: Pre-load image 0 only, so there's something visible immediately ── */
      setStatusMsg("Loading first visual…");
      await loadImageForIndex(0);

      /* ── Step 4: Show the player — time-driven loader takes over ────────── */
      // From here, handleTimeUpdate fires every ~250ms and loads images
      // for any phrase whose startTime is within LOOKAHEAD_SECS of the
      // current playback position. This is correct for both slow ballads
      // and fast rap — images are fetched at exactly the right moment,
      // not on an arbitrary fixed timer.
      setAppState("playing");
      setStatusMsg("");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg(`Error: ${msg}`);
    }
  }, [loadImageForIndex]);

  /* ── Sync engine — runs on every audio tick (~4× per second) ──────────── */
  const handleTimeUpdate = useCallback((time: number) => {
    const phrases = lyricsRef.current;

    /* ── 1. Update currently visible lyric & crossfade image ─────────────── */
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

    /* ── 2. Rolling loader: load the NEXT unloaded phrase within lookahead ── */
    // Only one fetch at a time. We scan forward from the current time
    // and trigger loading for the closest phrase that's:
    //   • not yet loaded/in-flight
    //   • starting within LOOKAHEAD_SECS from now
    // For fast rap (0.5s phrases) and slow ballads alike, this ensures
    // the image is fetching well before it's needed on screen.
    if (!isLoadingRef.current) {
      const target = phrases.find(
        (p, i) =>
          p.startTime > time &&                          // not yet playing
          p.startTime - time <= LOOKAHEAD_SECS &&        // within lookahead window
          !loadedSetRef.current.has(i)                   // not already loading/loaded
      );

      if (target) {
        const idx = phrases.indexOf(target);
        isLoadingRef.current = true;
        loadImageForIndex(idx).then(() => {
          isLoadingRef.current = false;
        });
      }
    }
  }, [loadImageForIndex]);

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
    lyricsRef.current    = [];
    isLoadingRef.current = false;
    loadedSetRef.current = new Set();
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
