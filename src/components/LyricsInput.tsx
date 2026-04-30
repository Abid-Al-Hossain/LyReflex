"use client";

interface LyricsInputProps {
  fileName: string;
  onStart:  (lyrics: string) => void;
  onBack:   () => void;
}

const DEMO = `[00:05.00] I feel it coming, feel it coming, babe
[00:09.50] I feel it coming, feel it coming, babe
[00:14.00] I been running, running, racing with the night
[00:19.00] Every passing moment I just feel the fire
[00:24.00] Stars are shining bright above the cityscape
[00:29.00] Lost inside a dream I never want to wake
[00:34.00] Dancing in the midnight, underneath the moon
[00:39.00] Looking for the feeling every afternoon
[00:44.00] Follow every rainbow till the sky turns dark
[00:49.00] You just gotta listen to your beating heart
[00:54.00] Every little moment that you feel alive
[00:59.00] Scream it to the heavens, let your spirit rise`;

export default function LyricsInput({ fileName, onStart, onBack }: LyricsInputProps) {
  const name = fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  let textRef: HTMLTextAreaElement | null = null;

  const handleStart = () => {
    onStart(textRef?.value?.trim() ?? "");
  };

  const handleDemo = () => {
    if (textRef) textRef.value = DEMO;
  };

  return (
    <section className="lyrics-step anim-fade-in">
      <div className="ls-card glass-md">
        {/* Header */}
        <div className="ls-header">
          <button className="cp-ghost-btn" onClick={onBack} style={{ fontSize: "0.85rem" }}>← Back</button>
          <div className="ls-track-name">
            <span style={{ fontSize: "1.1rem" }}>🎵</span>
            <span>{name}</span>
          </div>
        </div>

        <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Add <span className="gradient-text">Lyrics</span>
        </h2>
        <p style={{ color: "var(--text-2)", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          Paste your lyrics below. Supports{" "}
          <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: "4px", fontSize: "0.82rem" }}>
            [mm:ss.xx]
          </code>{" "}
          LRC timestamps for precise sync, or plain text for even distribution.
        </p>

        <textarea
          ref={(el) => { textRef = el; }}
          className="lyrics-textarea"
          placeholder={"Paste lyrics here…\n\nExample with timestamps:\n[00:12.30] First lyric line here\n[00:18.50] Second lyric line here\n\nOr just paste plain text — LyReflex will\ndistribute the images across the song automatically."}
          rows={12}
          spellCheck={false}
        />

        <div className="ls-actions">
          <button className="btn btn-ghost" onClick={handleDemo} style={{ fontSize: "0.85rem" }}>
            Use Demo Lyrics
          </button>
          <button className="btn btn-brand" onClick={handleStart} style={{ fontSize: "0.95rem", padding: "12px 28px" }}>
            ✨ Start Visual Journey
          </button>
        </div>

        <p style={{ fontSize: "0.75rem", color: "var(--text-3)", textAlign: "center", marginTop: "1rem" }}>
          No lyrics? Click "Use Demo Lyrics" to see the experience.
        </p>
      </div>
    </section>
  );
}
