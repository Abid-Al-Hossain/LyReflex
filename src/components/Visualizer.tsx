"use client";

import { useEffect, useRef, useState } from "react";

interface VisualizerProps {
  imageA:      string | null;
  imageB:      string | null;
  activeLayer: "a" | "b";
  currentText: string | null;
  isProcessing: boolean;
}

export default function Visualizer({ imageA, imageB, activeLayer, currentText, isProcessing }: VisualizerProps) {
  const [displayed, setDisplayed] = useState("");
  const [visible,   setVisible]   = useState(true);
  const prevText = useRef("");

  useEffect(() => {
    if (currentText === prevText.current) return;
    setVisible(false);
    const t = setTimeout(() => {
      prevText.current = currentText ?? "";
      setDisplayed(currentText ?? "");
      setVisible(true);
    }, 300);
    return () => clearTimeout(t);
  }, [currentText]);

  return (
    <div className="vis-bg">
      {/* Layer A — only render when a URL exists */}
      {imageA && (
        <img
          src={imageA}
          alt=""
          className="vis-layer"
          style={{ opacity: activeLayer === "a" ? 1 : 0 }}
        />
      )}
      {/* Layer B — only render when a URL exists */}
      {imageB && (
        <img
          src={imageB}
          alt=""
          className="vis-layer"
          style={{ opacity: activeLayer === "b" ? 1 : 0 }}
        />
      )}

      {/* Dark gradient overlay so text is always readable */}
      <div className="vis-grad" />

      {/* Center lyric */}
      <div className="vis-lyric-area">
        {isProcessing ? (
          <div className="vis-loading">
            <div className="dot-pulse"><span /><span /><span /></div>
            <span>Loading visuals…</span>
          </div>
        ) : (
          <p
            className="vis-lyric-text"
            style={{
              opacity:   visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(12px)",
            }}
          >
            {displayed || (!imageA && !imageB ? "Press play — images will sync with every lyric" : "")}
          </p>
        )}
      </div>
    </div>
  );
}
