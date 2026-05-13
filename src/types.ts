export interface LyricMoment {
  text: string;
  startTime: number;
  endTime: number;
  keyword: string;
  imageUrl?: string;
}

export type AppState = "upload" | "processing" | "playing";

/** User-selectable visual mode */
export type VisualMode = "gif" | "image";
