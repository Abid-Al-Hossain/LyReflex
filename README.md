# 🎵 LyReflex — Visual Music Experience

LyReflex is an experimental web application that transforms your music into a dynamic, cinematic visual experience. Simply upload an audio file, and the app automatically transcribes the audio, detects semantic lyric phrases using a Large Language Model, and fetches synchronized stock imagery that crossfades seamlessly to the beat of the track.

## ✨ Features

- **Automated AI Transcription:** Uses **Groq Whisper Large v3** to analyze audio in 1–2 seconds, providing precise, word-level timestamps.
- **Semantic Phrase Detection:** Employs **Groq LLM (llama-3.1-8b-instant)** to intelligently group raw transcribed words into meaningful, human-readable lyric lines (no arbitrary cutting).
- **Dynamic Visual Engine:** Extracts core thematic keywords per phrase and fetches context-aware, high-quality images from **Pixabay**, **Pexels**, and **Wikipedia's Free Image API**.
- **Performance-Optimized Rolling Loader:** Instead of bulk-requesting images (which triggers API rate limits), LyReflex uses a time-driven rolling buffer. Images are pre-fetched sequentially based on the exact audio playback timestamp.
- **Cinematic Crossfading:** Employs an A/B layering system to ensure zero-flicker, smooth image transitions during playback.
- **Privacy-First Key Management:** Users can safely input their Groq API keys directly in the browser. Keys are stored locally via `localStorage` and never hit a database.
- **Serverless Fallback:** Automatically falls back to the free **HuggingFace Inference API** for basic transcription if a Groq key isn't provided.

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
   Rename `.env.local.example` to `.env.local` and add your image API keys. You can also define your Groq key here to make it the default for the server.
   ```env
   NEXT_PUBLIC_PIXABAY_API_KEY=your_pixabay_key
   NEXT_PUBLIC_PEXELS_API_KEY=your_pexels_key
   NEXT_PUBLIC_GROQ_API_KEY=your_optional_groq_key
   ```
   *Note: Users can also input their Groq key dynamically via the app interface. The Wikipedia Image fallback requires no API keys at all.*

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🛠️ Architecture Overview

- **Framework:** Next.js 16 (App Router)
- **Styling:** Vanilla CSS (`globals.css`)
- **Transcription Service:** Custom `transcription.ts` wrapper interfacing directly with `api.groq.com/openai/v1/audio/transcriptions`.
- **Semantic Analysis:** `phraseService.ts` leverages `llama-3.1-8b-instant` to align exact word timestamps with meaningful semantic phrases in a single batch call.
- **Audio Processing:** Browser-native Web Audio API for fast client-side audio decoding.
- **Visual Engine:** React `useRef` based rolling buffer syncing engine, ensuring robust event firing and precise image loading against the HTML `<audio>` `timeupdate` timeline.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the issues page if you want to contribute.

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).
