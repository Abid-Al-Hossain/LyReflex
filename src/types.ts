export interface LyricMoment {
  text: string;
  startTime: number;
  endTime: number;
  keyword: string;  // 2-3 word concrete visual term used for both Giphy and Pixabay
  imageUrl?: string;
}

export type AppState = "upload" | "processing" | "playing";

/** User-selectable visual mode */
export type VisualMode = "gif" | "image";
