import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/config/constants";
import { BinaryFrame } from "@/types/frames";

type PackedFrame = {
  data: string; // base64 string of packed bits (1 = black, 0 = white)
};

export type FrameFile = {
  version: 1;
  width: number;
  height: number;
  speed?: number;
  frames: PackedFrame[];
  meta?: {
    name?: string;
    createdAt?: string;
  };
};

const hasAtob = typeof atob === "function";
const hasBtoa = typeof btoa === "function";

const toBase64 = (bytes: Uint8Array) => {
  if (hasBtoa) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
};

const fromBase64 = (encoded: string): Uint8Array => {
  if (hasAtob) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(encoded, "base64"));
};

const packFrameData = (frame: BinaryFrame): string => {
  const totalPixels = frame.width * frame.height;
  const byteLength = Math.ceil(totalPixels / 8);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < totalPixels; i++) {
    const byteIndex = i >> 3;
    const bitIndex = i & 7;
    const isBlack = frame.data[i] === 0;
    if (isBlack) {
      bytes[byteIndex] |= 1 << bitIndex;
    }
  }
  return toBase64(bytes);
};

const unpackFrameData = (packed: string, width: number, height: number): Uint8ClampedArray => {
  const bytes = fromBase64(packed);
  const totalPixels = width * height;
  const data = new Uint8ClampedArray(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const byteIndex = i >> 3;
    const bitIndex = i & 7;
    const isBlack = (bytes[byteIndex] >> bitIndex) & 1;
    data[i] = isBlack ? 0 : 255;
  }
  return data;
};

export const framesToFile = (frames: BinaryFrame[], speed?: number): FrameFile => {
  if (!frames.length) {
    throw new Error("No frames to save.");
  }
  const width = frames[0].width || OUTPUT_WIDTH;
  const height = frames[0].height || OUTPUT_HEIGHT;
  return {
    version: 1,
    width,
    height,
    speed,
    frames: frames.map((frame) => ({
      data: packFrameData(frame)
    })),
    meta: { createdAt: new Date().toISOString() }
  };
};

export const fileToFrames = (file: FrameFile): { frames: BinaryFrame[]; speed?: number } => {
  if (!file || file.version !== 1) {
    throw new Error("Unsupported frame file format.");
  }
  const width = file.width || OUTPUT_WIDTH;
  const height = file.height || OUTPUT_HEIGHT;
  if (!Array.isArray(file.frames) || !file.frames.length) {
    throw new Error("Frame file has no frames.");
  }
  const hydrated = file.frames.map((packed) => ({
    id: crypto.randomUUID(),
    width,
    height,
    data: unpackFrameData(packed.data, width, height)
  }));
  return { frames: hydrated, speed: file.speed };
};

export const downloadFrameFile = (frames: BinaryFrame[], speed?: number) => {
  const payload = framesToFile(frames, speed);
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `badge-frames-${timestamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const parseFrameFile = (text: string) => {
  const parsed = JSON.parse(text) as FrameFile;
  return fileToFrames(parsed);
};

export const readFrameFile = async (file: File) => {
  const text = await file.text();
  return parseFrameFile(text);
};
