"use client";

interface NavbarProps {
  onKeyClick?: () => void;
  groqKeySet?: boolean;
}

export default function Navbar({ onKeyClick, groqKeySet }: NavbarProps) {
  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <a className="brand" href="/">
          <div className="brand-icon">🎵</div>
          <span className="brand-name">LyReflex</span>
          <span className="badge">Beta</span>
        </a>

        <div className="navbar-right">
          <div className="api-badge">
            <span className="api-dot" />
            <span>Pixabay · Pexels</span>
          </div>

          {onKeyClick && (
            <button
              className={`key-nav-btn ${groqKeySet ? "key-nav-btn--active" : ""}`}
              onClick={onKeyClick}
              title={groqKeySet ? "Groq key active — click to manage" : "Add Groq API key for instant transcription"}
            >
              <span className="key-nav-icon">⚡</span>
              <span className="key-nav-label">
                {groqKeySet ? "Groq active" : "Add Groq key"}
              </span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
