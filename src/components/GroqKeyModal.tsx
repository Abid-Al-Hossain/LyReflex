"use client";
import { useState, useEffect } from "react";

/* ── localStorage keys ─────────────────────────────────────────────────── */
const LS_GROQ    = "lyreflex_groq_key";
const LS_GIPHY   = "lyreflex_giphy_key";
const LS_PIXABAY = "lyreflex_pixabay_key";

/* ── Key config definitions ───────────────────────────────────────────── */
interface KeyConfig {
  id:          string;
  lsKey:       string;
  icon:        string;
  label:       string;
  subtitle:    string;
  placeholder: string;
  signupUrl:   string;
  signupLabel: string;
  steps:       string[];
  fallback:    string;
}

const KEYS: KeyConfig[] = [
  {
    id: "groq",    lsKey: LS_GROQ,
    icon: "⚡",    label: "Groq",
    subtitle: "Powers instant transcription + smart lyrics",
    placeholder: "gsk_••••••••••••••••••••",
    signupUrl: "https://console.groq.com/keys",
    signupLabel: "console.groq.com/keys",
    steps: [
      "Sign up free at console.groq.com",
      "Click Create API Key, copy it",
      "Paste below — saved only in your browser",
    ],
    fallback: "Without: HuggingFace Whisper (~15–30 s)",
  },
  {
    id: "giphy",   lsKey: LS_GIPHY,
    icon: "🎞️",   label: "Giphy",
    subtitle: "Animated GIFs for GIF visual mode",
    placeholder: "your_giphy_api_key",
    signupUrl: "https://developers.giphy.com/dashboard/",
    signupLabel: "developers.giphy.com",
    steps: [
      "Go to developers.giphy.com/dashboard",
      "Create an App → select API → copy key",
      "Paste below — 100 req/hr free",
    ],
    fallback: "Without: falls back to images",
  },
  {
    id: "pixabay", lsKey: LS_PIXABAY,
    icon: "🖼️",   label: "Pixabay",
    subtitle: "High-quality stock photos for Image mode",
    placeholder: "your_pixabay_api_key",
    signupUrl: "https://pixabay.com/api/docs/",
    signupLabel: "pixabay.com/api/docs",
    steps: [
      "Sign up free at pixabay.com",
      "Go to API docs, copy your key",
      "Paste below — 5,000 req/hr free",
    ],
    fallback: "Without: Wikipedia images (no key needed)",
  },
];

/* ── Modal component ──────────────────────────────────────────────────── */
interface Props {
  onClose: () => void;
  onSave:  () => void;  // called after any key change
  initialTab?: string;   // "groq" | "giphy" | "pixabay"
}

export default function ApiKeysModal({ onClose, onSave, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "groq");
  const [savedKeys, setSavedKeys] = useState<Record<string, string | null>>({});
  const [input,     setInput]     = useState("");
  const [visible,   setVisible]   = useState(false);

  // Load all keys on mount
  useEffect(() => {
    const loaded: Record<string, string | null> = {};
    for (const k of KEYS) loaded[k.id] = localStorage.getItem(k.lsKey);
    setSavedKeys(loaded);
    setInput(loaded[initialTab ?? "groq"] ?? "");
  }, [initialTab]);

  // When tab changes, load that key's value
  useEffect(() => {
    setInput(savedKeys[activeTab] ?? "");
    setVisible(false);
  }, [activeTab, savedKeys]);

  const cfg   = KEYS.find((k) => k.id === activeTab)!;
  const saved = savedKeys[activeTab] ?? null;

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    localStorage.setItem(cfg.lsKey, trimmed);
    setSavedKeys((prev) => ({ ...prev, [activeTab]: trimmed }));
    onSave();
  };

  const handleDelete = () => {
    localStorage.removeItem(cfg.lsKey);
    setSavedKeys((prev) => ({ ...prev, [activeTab]: null }));
    setInput("");
    onSave();
  };

  const masked = saved
    ? saved.slice(0, 4) + "••••••••" + saved.slice(-4)
    : null;

  const activeCount = Object.values(savedKeys).filter(Boolean).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box glass-md" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-head">
          <span className="modal-icon">🔑</span>
          <div>
            <h2 className="modal-title">API Keys</h2>
            <p className="modal-sub">{activeCount}/3 configured — all stored locally</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab pills */}
        <div className="key-tabs">
          {KEYS.map((k) => {
            const isSet = !!savedKeys[k.id];
            return (
              <button
                key={k.id}
                className={`key-tab ${activeTab === k.id ? "key-tab--active" : ""} ${isSet ? "key-tab--set" : ""}`}
                onClick={() => setActiveTab(k.id)}
              >
                <span>{k.icon}</span>
                <span>{k.label}</span>
                {isSet && <span className="key-tab-dot" />}
              </button>
            );
          })}
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
            <span>{cfg.fallback}</span>
          </div>
        )}

        {/* Instructions */}
        <ol className="key-steps">
          {cfg.steps.map((step, i) => (
            <li key={i}>
              {i === 0 ? (
                <>
                  <a
                    href={cfg.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="key-link"
                  >
                    {cfg.signupLabel} ↗
                  </a>
                </>
              ) : (
                step
              )}
            </li>
          ))}
        </ol>

        {/* Input */}
        <div className="key-input-row">
          <input
            className="key-input"
            type={visible ? "text" : "password"}
            placeholder={cfg.placeholder}
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
              🗑 Remove
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
          🔒 Keys never leave your device — stored in browser localStorage only.
        </p>
      </div>
    </div>
  );
}

/* ── Utility hooks ────────────────────────────────────────────────────── */

export function useGroqKey() {
  const [key, setKeyState] = useState<string | null>(null);
  useEffect(() => { setKeyState(localStorage.getItem(LS_GROQ)); }, []);
  const setKey = (k: string | null) => {
    if (k) localStorage.setItem(LS_GROQ, k);
    else   localStorage.removeItem(LS_GROQ);
    setKeyState(k);
  };
  return { key, setKey };
}

export function useApiKeys() {
  const [keys, setKeys] = useState({ groq: "", giphy: "", pixabay: "" });

  const reload = () => {
    setKeys({
      groq:    localStorage.getItem(LS_GROQ)    ?? "",
      giphy:   localStorage.getItem(LS_GIPHY)   ?? "",
      pixabay: localStorage.getItem(LS_PIXABAY) ?? "",
    });
  };

  useEffect(() => { reload(); }, []);

  return { keys, reload };
}
