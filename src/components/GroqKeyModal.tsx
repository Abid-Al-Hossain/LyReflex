"use client";
import { useState, useEffect } from "react";

const LS_KEY = "lyreflex_groq_key";

interface Props {
  onClose: () => void;
  onSave:  (key: string | null) => void;
}

export default function GroqKeyModal({ onClose, onSave }: Props) {
  const [saved,   setSaved]   = useState<string | null>(null);
  const [input,   setInput]   = useState("");
  const [visible, setVisible] = useState(false);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    const k = localStorage.getItem(LS_KEY);
    setSaved(k);
    setInput(k ?? "");
  }, []);

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    localStorage.setItem(LS_KEY, trimmed);
    setSaved(trimmed);
    onSave(trimmed);
    onClose();
  };

  const handleDelete = () => {
    localStorage.removeItem(LS_KEY);
    setSaved(null);
    setInput("");
    onSave(null);
  };

  const masked = saved
    ? saved.slice(0, 6) + "•".repeat(Math.max(0, saved.length - 10)) + saved.slice(-4)
    : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box glass-md" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-head">
          <span className="modal-icon">⚡</span>
          <div>
            <h2 className="modal-title">Groq API Key</h2>
            <p className="modal-sub">Powers instant 2-second transcription</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Status badge */}
        {saved ? (
          <div className="key-status key-status--ok">
            <span>🔑</span>
            <span className="key-masked">{masked}</span>
            <span className="key-tag">Active</span>
          </div>
        ) : (
          <div className="key-status key-status--none">
            <span>🔓</span>
            <span>No key set — using free HuggingFace fallback (~15–30 s)</span>
          </div>
        )}

        {/* Instructions */}
        <ol className="key-steps">
          <li>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="key-link"
            >
              Open console.groq.com/keys ↗
            </a>
            &nbsp;and sign up free
          </li>
          <li>Click <strong>Create API Key</strong>, copy it</li>
          <li>Paste below — saved only in your browser</li>
        </ol>

        {/* Input */}
        <div className="key-input-row">
          <input
            className="key-input"
            type={visible ? "text" : "password"}
            placeholder="gsk_••••••••••••••••••••••••••••••••••••"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="key-toggle"
            onClick={() => setVisible((v) => !v)}
            title={visible ? "Hide" : "Show"}
          >
            {visible ? "🙈" : "👁"}
          </button>
        </div>

        {/* Actions */}
        <div className="key-actions">
          {saved && (
            <button className="btn btn-ghost btn-sm" onClick={handleDelete}>
              🗑 Remove key
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!input.trim() || input.trim() === saved}
          >
            {saved ? "Replace key" : "Save key"}
          </button>
        </div>

        <p className="key-privacy">
          🔒 Your key never leaves your device — stored in browser localStorage only.
        </p>
      </div>
    </div>
  );
}

/* Utility hook used by other components */
export function useGroqKey() {
  const [key, setKeyState] = useState<string | null>(null);

  useEffect(() => {
    setKeyState(localStorage.getItem(LS_KEY));
  }, []);

  const setKey = (k: string | null) => {
    if (k) localStorage.setItem(LS_KEY, k);
    else    localStorage.removeItem(LS_KEY);
    setKeyState(k);
  };

  return { key, setKey };
}
