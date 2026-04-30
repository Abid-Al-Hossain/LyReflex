"use client";

import { useRef, useState, useCallback } from "react";

interface UploaderProps {
  onUpload: (file: File) => void;
}

export default function Uploader({ onUpload }: UploaderProps) {
  const ref          = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handle = useCallback((file: File) => {
    if (file?.type.startsWith("audio/")) onUpload(file);
  }, [onUpload]);

  return (
    <section className="hero-screen">
      <div className="hero-text">
        <h1 className="hero-tagline anim-slide-up">
          Your lyrics,{" "}<span className="gradient-text">alive</span>
          <span className="hero-line2"> in every <span className="gradient-text-warm">frame.</span></span>
        </h1>
        <p className="hero-sub anim-slide-up anim-delay-1">
          Upload a track, paste your lyrics — LyReflex finds the visuals and syncs them live.
        </p>
      </div>

      <div
        className={`upload-zone anim-slide-up anim-delay-2${drag ? " dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
        onClick={() => ref.current?.click()}
      >
        <div className="upload-icon">🎧</div>
        <p className="upload-title">Drop your audio here</p>
        <p className="upload-hint">or click to browse</p>
        <div className="format-pills">
          {["MP3","WAV","M4A","FLAC","OGG"].map(f => <span key={f} className="pill">{f}</span>)}
        </div>
        <button className="btn btn-brand">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Choose Audio File
        </button>
        <input ref={ref} type="file" accept="audio/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      </div>

      <div className="feature-pills anim-slide-up anim-delay-3">
        {[["⚡","Instant sync"],["🖼️","HD visuals"],["🔒","100% local"],["🎵","Lyric driven"]].map(([i,l]) => (
          <div key={l} className="feature-pill"><span>{i}</span><span>{l}</span></div>
        ))}
      </div>
    </section>
  );
}
