"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface AudioPlayerProps {
  src: string;
  fileName: string;
  onTimeUpdate: (time: number) => void;
  onReset: () => void;
}

function fmt(s: number) {
  if (!isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export default function AudioPlayer({ src, fileName, onTimeUpdate, onReset }: AudioPlayerProps) {
  const audioRef                  = useRef<HTMLAudioElement>(null);
  const onTimeUpdateRef           = useRef(onTimeUpdate);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current,   setCurrent]   = useState(0);
  const [duration,  setDuration]  = useState(0);
  const [volume,    setVolume]    = useState(0.8);
  const [muted,     setMuted]     = useState(false);

  // Keep callback ref fresh (avoids stale closure)
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  useEffect(() => {
    const a = audioRef.current!;
    a.volume = volume;
    const onMeta  = () => setDuration(a.duration || 0);
    const onTime  = () => { setCurrent(a.currentTime); onTimeUpdateRef.current(a.currentTime); };
    const onEnded = () => setIsPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
    };
  }, [src]); // re-run on new src

  const toggle = () => {
    const a = audioRef.current!;
    isPlaying ? a.pause() : a.play();
    setIsPlaying(!isPlaying);
  };

  const skip = (d: number) => {
    const a = audioRef.current!;
    a.currentTime = Math.max(0, Math.min(a.currentTime + d, duration));
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a    = audioRef.current!;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const changeVol = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    audioRef.current!.volume = v;
    setMuted(v === 0);
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const name = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  return (
    <div className="compact-player">
      <audio ref={audioRef} src={src} preload="auto" />

      {/* Row 1: track + time + reset */}
      <div className="cp-row cp-meta">
        <span className="cp-name">{name || "Track"}</span>
        <span className="cp-time">{fmt(current)} / {fmt(duration)}</span>
        <button className="cp-ghost-btn" onClick={onReset}>↩ New</button>
      </div>

      {/* Row 2: progress bar */}
      <div className="cp-progress" onClick={seek}>
        <div className="cp-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Row 3: controls + volume */}
      <div className="cp-row cp-controls">
        <div className="cp-btns">
          <button className="cp-icon" onClick={() => skip(-10)} title="−10s">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
            </svg>
          </button>

          <button className="cp-play" onClick={toggle}>
            {isPlaying
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            }
          </button>

          <button className="cp-icon" onClick={() => skip(10)} title="+10s">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.51"/>
            </svg>
          </button>
        </div>

        <div className="cp-vol">
          <button className="cp-icon" onClick={() => setMuted(!muted)} style={{ color: muted ? "var(--text-3)" : "var(--text-2)" }}>
            {muted || volume === 0
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3M8 23h8"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            }
          </button>
          <input type="range" min="0" max="1" step="0.02"
            value={muted ? 0 : volume} onChange={changeVol}
            className="cp-vol-slider" />
        </div>
      </div>
    </div>
  );
}
