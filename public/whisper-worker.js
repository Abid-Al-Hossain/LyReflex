/**
 * LyReflex Whisper Module Worker
 * Must be loaded with { type: 'module' } — uses ES import, not importScripts.
 */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache  = true;  // cache model after first download

let pipe = null;

self.onmessage = async (e) => {
  const { audio, sampleRate } = e.data;

  try {
    if (!pipe) {
      self.postMessage({ type: 'status', message: 'Downloading Whisper model (one-time, ~75 MB)…' });

      pipe = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-tiny',
        {
          progress_callback: (p) => {
            if (p.status === 'downloading' || p.status === 'progress') {
              const loaded  = p.loaded  ?? 0;
              const total   = p.total   ?? 1;
              self.postMessage({
                type:    'progress',
                file:    p.file ?? '',
                loaded,
                total,
                percent: Math.round((loaded / total) * 100),
              });
            }
          },
        }
      );
    }

    self.postMessage({ type: 'status', message: 'Transcribing audio…' });

    const result = await pipe(audio, {
      sampling_rate:     sampleRate,
      return_timestamps: 'word',
      chunk_length_s:    30,
      stride_length_s:   5,
      language:          'english',
    });

    self.postMessage({ type: 'done', chunks: result.chunks ?? [] });

  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message ?? err) });
  }
};
