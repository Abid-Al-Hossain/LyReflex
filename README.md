# 🎵 LyReflex — Visual Lyric Experience

LyReflex is an AI-powered web application that transforms any audio file into a dynamic, cinematic visual experience. Upload a song, lecture, or podcast — the app transcribes speech with AI, detects meaningful phrase-level subtitles, and syncs contextual **GIFs** or **photos** that crossfade in real-time.

## ✨ Features

- **Dual Visual Mode:** Choose between 🎞️ **GIF mode** (animated Giphy GIFs) or 🖼️ **Image mode** (cinematic Pixabay photos) before upload.
- **AI Transcription:** Uses **Groq Whisper Large v3** for accurate, word-level timestamped transcription in 1–2 seconds. Works on songs, lectures, podcasts, and more.
- **Semantic Phrase Detection:** Employs **Groq LLaMA 3.3 70B** to group raw words into meaningful subtitle phrases — minimum 5 words, no fragments, exactly like Netflix/YouTube subtitles.
- **Cultural Keyword Intelligence:** The 70B LLM identifies the song/artist from context and generates genre-aware, culturally accurate visual search terms. "Pull up in the ghost" → `Rolls Royce`, "made your whole year in a week" → `stacks of money`.
- **Chain-of-Thought Prompting:** The LLM first identifies the song's visual aesthetic (color palette, mood, music video style), then generates all keywords within that world for consistent visual coherence.
- **Spam-Filtered GIF Results:** Custom blocklist prevents birthday/meme/holiday GIFs from appearing for music-related queries.
- **Parallel Rolling Loader:** All upcoming phrases within a 15-second window load simultaneously — no single-file bottleneck, instant transitions even after seeking.
- **Cinematic Crossfading:** A/B layer system for zero-flicker, smooth visual transitions.
- **Privacy-First:** All API keys stored locally via `localStorage`. Nothing touches a database.
- **Serverless Fallback:** Falls back to HuggingFace Whisper + Wikipedia Images if no API keys are set.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Abid-Al-Hossain/LyReflex.git
   cd LyReflex
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Add API Keys** via the ⚡ button in the app:
   - **Groq** (required for best quality) — free at [console.groq.com](https://console.groq.com)
   - **Giphy** (GIF mode) — free at [developers.giphy.com](https://developers.giphy.com/dashboard/)
   - **Pixabay** (Image mode) — free at [pixabay.com/api/docs](https://pixabay.com/api/docs/)

   > No API keys? The app still works using HuggingFace Whisper + Wikipedia Images as zero-config fallbacks.

## 🛠️ Architecture

```
Audio File
    │
    ▼
Groq Whisper Large v3  ──── word-level timestamps
    │
    ▼
Groq LLaMA 3.3 70B  ─────── semantic phrases + visual keywords
    │                        (chain-of-thought: identify song → genre → visual world)
    ▼
Parallel Rolling Buffer ──── preloads all phrases in 15s lookahead window
    │
    ┌─────────────┬──────────────────────────────┐
    ▼             ▼                              ▼
GIF mode      Image mode                    Fallback cascade
Giphy         Pixabay → Wikipedia → Picsum
```

**Stack:**
- **Framework:** Next.js 16 (App Router, Turbopack)
- **Styling:** Vanilla CSS
- **Transcription:** `transcription.ts` — Groq Whisper Large v3 / HuggingFace fallback
- **Phrase Detection:** `phraseService.ts` — LLaMA 3.3 70B with few-shot chain-of-thought prompting
- **Visual Engine:** `imageService.ts` — Dual-mode with spam filtering + cascading fallbacks
- **Sync Engine:** React `useRef` parallel rolling buffer driven by `<audio>` `timeupdate`

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the [issues page](https://github.com/Abid-Al-Hossain/LyReflex/issues).

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).
