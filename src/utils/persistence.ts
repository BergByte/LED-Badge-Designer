import { BinaryFrame } from "@/types/frames";

const STORAGE_KEY = "badge-app-state";

export type PersistedFrame = {
  id: string;
  width: number;
  height: number;
  data: number[];
};

export type PersistedVideoState = {
  threshold: number;
  invertOutput: boolean;
  startTime: number;
  duration: number | null;
  zoom: number;
  crop: { x: number; y: number };
  cropAreaPercent: { x: number; y: number; width: number; height: number } | null;
  sourceDimensions?: { width: number; height: number };
  lastMediaName?: string;
};

export type PersistedAppState = {
  mode?: "video" | "pixel";
  speed?: number;
  frames?: PersistedFrame[];
  video?: PersistedVideoState | null;
};

const safeParse = (value: string): PersistedAppState | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const saveAppState = (state: PersistedAppState) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Unable to persist badge state", err);
  }
};

export const loadAppState = (): PersistedAppState | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  return parsed;
};

export const serializeFrames = (frames: BinaryFrame[]): PersistedFrame[] =>
  frames.map((frame) => ({
    id: frame.id,
    width: frame.width,
    height: frame.height,
    data: Array.from(frame.data)
  }));

export const hydrateFrames = (frames?: PersistedFrame[]): BinaryFrame[] => {
  if (!Array.isArray(frames) || !frames.length) return [];
  return frames
    .map((frame) => {
      if (
        !frame ||
        typeof frame.id !== "string" ||
        typeof frame.width !== "number" ||
        typeof frame.height !== "number" ||
        !Array.isArray(frame.data)
      ) {
        return null;
      }
      const expectedLength = frame.width * frame.height;
      const data = new Uint8ClampedArray(expectedLength);
      for (let i = 0; i < expectedLength; i++) {
        const val = frame.data[i];
        data[i] = val === 0 ? 0 : 255;
      }
      return {
        id: frame.id,
        width: frame.width,
        height: frame.height,
        data
      };
    })
    .filter(Boolean) as BinaryFrame[];
};
