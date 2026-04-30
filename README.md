# 🎵 LyReflex — Visual Music Experience

LyReflex is an experimental web application that transforms your music into a dynamic, cinematic visual experience. Simply upload an audio file, and the app automatically transcribes the lyrics/audio, extracts core thematic keywords, and fetches synchronized stock imagery that crossfades seamlessly to the beat of the track.

## ✨ Features

- **Automated AI Transcription:** Uses **Groq Whisper Large v3** to analyze audio in 1–2 seconds, providing precise, word-level timestamps.
- **Serverless Fallback:** Automatically falls back to the free **HuggingFace Inference API** if a Groq key isn't provided.
- **Dynamic Visual Engine:** Groups words into rhythmic phrases and fetches context-aware, high-quality images from **Pixabay** and **Pexels**.
- **Cinematic Crossfading:** Employs an A/B layering system to ensure zero-flicker, smooth image transitions during playback.
- **Privacy-First Key Management:** Users can safely input their Groq API keys directly in the browser. Keys are stored locally via `localStorage` and never hit a database.
- **Modern UI:** A beautiful, responsive glassmorphism interface built with React and vanilla CSS.

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
   *Note: Users can also input their Groq key dynamically via the app interface.*

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🛠️ Architecture Overview

- **Framework:** Next.js 16 (App Router)
- **Styling:** Vanilla CSS (`globals.css`)
- **Transcription Service:** Custom `transcription.ts` wrapper interfacing directly with `api.groq.com` and `api-inference.huggingface.co`.
- **Audio Processing:** Browser-native Web Audio API for fast client-side audio decoding and duration measurement.
- **Visual Engine:** React `useRef` based syncing engine ensuring robust event firing against the HTML `<audio>` `timeupdate` timeline.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to check the issues page if you want to contribute.

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).
