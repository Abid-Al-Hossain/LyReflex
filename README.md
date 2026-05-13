# 🎵 LyReflex — Visual Music Experience

LyReflex is an experimental web application that transforms your music into a dynamic, cinematic visual experience. Upload an audio file, and the app transcribes the lyrics with AI, detects meaningful lyric phrases, and syncs contextual **GIFs** or **photos** that crossfade in real-time with the beat.

## ✨ Features

- **Dual Visual Mode:** Choose between 🎞️ **GIF mode** (animated Giphy GIFs for vibes) or 🖼️ **Image mode** (cinematic Pixabay/Pexels photos) before upload.
- **Automated AI Transcription:** Uses **Groq Whisper Large v3** to analyze audio in 1–2 seconds with word-level timestamps.
- **Semantic Phrase Detection:** Employs **Groq LLM (llama-3.1-8b-instant)** to intelligently group raw words into meaningful lyric lines — not arbitrary chunks.
- **Smart Visual Keywords:** Each phrase is tagged with a vivid, concrete search keyword by the same LLM call — "pull up in the wraith" → `Rolls Royce`, "made your whole year" → `achievement`.
- **Time-Driven Rolling Loader:** Images/GIFs load based on actual audio playback timestamps. Works for both slow ballads and fast rap — no fixed timers, no API flooding.
- **Cinematic Crossfading:** A/B layering system for zero-flicker, smooth visual transitions.
- **Privacy-First:** API keys stored locally via `localStorage`. Nothing hits a database.
- **Serverless Fallback:** Falls back to **HuggingFace Whisper** for transcription and **Wikipedia Images** for visuals if no API keys are set.

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

3. **Set up Environment Variables:**
   Copy `.env.local.example` to `.env.local` and add your API keys:
   ```env
   # GIF mode (default) — get free key at https://developers.giphy.com/dashboard/
   NEXT_PUBLIC_GIPHY_API_KEY=your_giphy_key

   # Image mode — get free keys at pixabay.com/api/docs & pexels.com/api
   NEXT_PUBLIC_PIXABAY_API_KEY=your_pixabay_key
   NEXT_PUBLIC_PEXELS_API_KEY=your_pexels_key

   # Transcription — get free key at https://console.groq.com
   NEXT_PUBLIC_GROQ_API_KEY=your_groq_key
   ```
   > **Note:** Users can also input their Groq key dynamically via the app interface. Wikipedia Image fallback requires no keys at all.

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser.

## 🛠️ Architecture Overview

```
Audio File → Groq Whisper (transcribe) → Groq LLM (semantic phrases + keywords)
                                           ↓
                                     Time-driven rolling buffer
                                           ↓
                              GIF mode: Giphy → Pixabay → Wikipedia → Picsum
                            Image mode: Pixabay → Pexels → Wikipedia → Picsum
```

- **Framework:** Next.js 16 (App Router)
- **Styling:** Vanilla CSS (`globals.css`)
- **Transcription:** `transcription.ts` — Groq Whisper Large v3 / HuggingFace fallback
- **Phrase Detection:** `phraseService.ts` — One Groq LLM call for all phrases + keywords
- **Visual Engine:** `imageService.ts` — Dual-mode (GIF/Image) with cascading fallbacks
- **Sync Engine:** React `useRef` rolling buffer driven by `<audio>` `timeupdate`

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the issues page.

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).
