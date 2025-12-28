"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_VIDEO_DURATION_SECONDS,
  OUTPUT_ASPECT,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH
} from "@/config/constants";
import { BinaryFrame } from "@/types/frames";
import { createBlankFrame } from "@/utils/frameUtils";

type Props = {
  fps: number;
  onFramesChange: (frames: BinaryFrame[]) => void;
};

type VideoMeta = {
  name: string;
  duration: number;
  width: number;
  height: number;
};

type Progress = {
  current: number;
  total: number;
  status: "idle" | "preparing" | "rendering" | "cancelled" | "done";
};

export default function VideoPanel({ fps, onFramesChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({
    current: 0,
    total: 0,
    status: "idle"
  });
  const cancelRef = useRef(false);

  const effectiveDuration = useMemo(() => {
    if (!meta || endTime === null) return 0;
    return Math.max(0, endTime - startTime);
  }, [endTime, meta, startTime]);

  const estimatedFrames = useMemo(() => {
    return Math.ceil(effectiveDuration * fps);
  }, [effectiveDuration, fps]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    cancelRef.current = false;

    const url = URL.createObjectURL(file);
    const video = videoRef.current;
    if (!video) return;
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = Math.min(video.duration, MAX_VIDEO_DURATION_SECONDS);
      setMeta({
        name: file.name,
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      });
      setStartTime(0);
      setEndTime(duration);
    };
    video.onerror = () => {
      setError("Unable to read video metadata");
    };
  };

  const clampTimes = (start: number, end: number, maxDuration: number) => {
    const clampedStart = Math.max(0, Math.min(start, maxDuration));
    const clampedEnd = Math.max(clampedStart + 0.01, Math.min(end, maxDuration));
    const span = clampedEnd - clampedStart;
    if (span > MAX_VIDEO_DURATION_SECONDS) {
      return {
        start: clampedStart,
        end: clampedStart + MAX_VIDEO_DURATION_SECONDS
      };
    }
    return { start: clampedStart, end: clampedEnd };
  };

  const centerCrop = (
    videoWidth: number,
    videoHeight: number
  ): { sx: number; sy: number; sw: number; sh: number } => {
    const videoAspect = videoWidth / videoHeight;
    if (videoAspect > OUTPUT_ASPECT) {
      // Too wide, crop sides
      const targetWidth = OUTPUT_ASPECT * videoHeight;
      const sx = (videoWidth - targetWidth) / 2;
      return { sx, sy: 0, sw: targetWidth, sh: videoHeight };
    }
    // Too tall, crop top/bottom
    const targetHeight = videoWidth / OUTPUT_ASPECT;
    const sy = (videoHeight - targetHeight) / 2;
    return { sx: 0, sy, sw: videoWidth, sh: targetHeight };
  };

  const thresholdFrame = (imageData: ImageData): Uint8ClampedArray => {
    const { data, width, height } = imageData;
    const out = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const val = gray >= 128 ? 0 : 255; // invert: >=128 -> 0
      const idx = i / 4;
      out[idx] = val;
    }
    return out;
  };

  const renderFrames = async () => {
    if (!meta || endTime === null || !videoRef.current) return;
    if (effectiveDuration <= 0) {
      setError("Select a valid trim range.");
      return;
    }
    setError(null);
    cancelRef.current = false;
    setProgress({ current: 0, total: estimatedFrames, status: "preparing" });

    const video = videoRef.current;
    const { sx, sy, sw, sh } = centerCrop(meta.width, meta.height);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Unable to create canvas context.");
      return;
    }

    const frames: BinaryFrame[] = [];
    const frameCount = estimatedFrames;

    const seekTo = (time: number) =>
      new Promise<void>((resolve, reject) => {
        const handle = () => {
          video.removeEventListener("seeked", handle);
          resolve();
        };
        const onError = () => {
          video.removeEventListener("error", onError);
          reject(new Error("Seek failed"));
        };
        video.addEventListener("seeked", handle, { once: true });
        video.addEventListener("error", onError, { once: true });
        video.currentTime = Math.min(time, video.duration - 0.01);
      });

    setProgress({ current: 0, total: frameCount, status: "rendering" });
    for (let i = 0; i < frameCount; i++) {
      if (cancelRef.current) {
        setProgress((prev) => ({ ...prev, status: "cancelled" }));
        return;
      }
      const t = startTime + i / fps;
      const clampedTime = Math.min(t, endTime - 0.001);
      await seekTo(clampedTime);
      ctx.drawImage(
        video,
        sx,
        sy,
        sw,
        sh,
        0,
        0,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT
      );
      const frameData = ctx.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      const binary = thresholdFrame(frameData);
      frames.push({
        id: crypto.randomUUID(),
        data: binary,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT
      });
      setProgress({ current: i + 1, total: frameCount, status: "rendering" });
    }

    onFramesChange(frames.length ? frames : [createBlankFrame()]);
    setProgress({ current: frameCount, total: frameCount, status: "done" });
  };

  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        URL.revokeObjectURL(video.src);
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Video → Badge</h3>
          <p className="text-sm text-slate-600">
            Upload a clip, trim to {MAX_VIDEO_DURATION_SECONDS}s, center-crop to 48:11, and
            render at the selected FPS (inverted binary).
          </p>
        </div>
        <button
          className="text-sm text-emerald-700 hover:text-emerald-900"
          onClick={() => {
            setStartTime(0);
            if (meta) {
              setEndTime(Math.min(meta.duration, MAX_VIDEO_DURATION_SECONDS));
            }
          }}
        >
          Reset trim
        </button>
      </div>

      <label className="flex flex-col gap-2 border border-dashed border-slate-300 rounded p-4 bg-slate-50">
        <span className="text-sm font-medium text-slate-800">Upload video</span>
        <input type="file" accept="video/*" onChange={handleFileChange} />
      </label>

      {meta && endTime !== null && (
        <div className="flex flex-col gap-3 bg-white border border-slate-200 rounded p-3">
          <div className="text-sm text-slate-700 flex flex-wrap gap-2">
            <span className="px-2 py-1 rounded bg-slate-100">
              File: {meta.name}
            </span>
            <span className="px-2 py-1 rounded bg-slate-100">
              Duration: {meta.duration.toFixed(2)}s (cap {MAX_VIDEO_DURATION_SECONDS}s)
            </span>
            <span className="px-2 py-1 rounded bg-slate-100">
              Resolution: {meta.width}×{meta.height} · target aspect{" "}
              {OUTPUT_ASPECT.toFixed(3)}
            </span>
            <span className="px-2 py-1 rounded bg-slate-100">
              Output: {OUTPUT_WIDTH}×{OUTPUT_HEIGHT}
            </span>
            <span className="px-2 py-1 rounded bg-slate-100">FPS: {fps}</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-slate-700">
              <span>
                Trim start: {startTime.toFixed(2)}s · Trim end: {endTime.toFixed(2)}s
              </span>
              <span>
                Span: {effectiveDuration.toFixed(2)}s · Est. frames: {estimatedFrames}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600 w-20">Start</label>
              <input
                type="range"
                min={0}
                max={Math.min(meta.duration, MAX_VIDEO_DURATION_SECONDS)}
                step={0.01}
                value={startTime}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  const { start, end } = clampTimes(
                    next,
                    endTime,
                    Math.min(meta.duration, MAX_VIDEO_DURATION_SECONDS)
                  );
                  setStartTime(start);
                  setEndTime(end);
                }}
                className="flex-1"
              />
              <input
                type="number"
                className="w-24 border border-slate-200 rounded px-2 py-1 text-sm"
                value={startTime.toFixed(2)}
                step={0.1}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  const { start, end } = clampTimes(
                    next,
                    endTime,
                    Math.min(meta.duration, MAX_VIDEO_DURATION_SECONDS)
                  );
                  setStartTime(start);
                  setEndTime(end);
                }}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-600 w-20">End</label>
              <input
                type="range"
                min={0}
                max={Math.min(meta.duration, MAX_VIDEO_DURATION_SECONDS)}
                step={0.01}
                value={endTime}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  const { start, end } = clampTimes(
                    startTime,
                    next,
                    Math.min(meta.duration, MAX_VIDEO_DURATION_SECONDS)
                  );
                  setStartTime(start);
                  setEndTime(end);
                }}
                className="flex-1"
              />
              <input
                type="number"
                className="w-24 border border-slate-200 rounded px-2 py-1 text-sm"
                value={endTime.toFixed(2)}
                step={0.1}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  const { start, end } = clampTimes(
                    startTime,
                    next,
                    Math.min(meta.duration, MAX_VIDEO_DURATION_SECONDS)
                  );
                  setStartTime(start);
                  setEndTime(end);
                }}
              />
            </div>
            <p className="text-xs text-slate-600">
              Aspect policy: center-crop to 48:11, nearest-neighbor scale to 48×11, then
              grayscale → threshold (≥128→0, else 255).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold disabled:opacity-50"
              onClick={renderFrames}
              disabled={progress.status === "rendering"}
            >
              Render frames from video
            </button>
            <button
              className="px-4 py-2 rounded border border-slate-200 bg-white text-slate-800 disabled:opacity-50"
              onClick={() => {
                cancelRef.current = true;
              }}
              disabled={progress.status !== "rendering"}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded border border-slate-200 bg-white text-slate-800"
              onClick={() => {
                setError(null);
                onFramesChange([createBlankFrame()]);
              }}
            >
              Clear frames
            </button>
          </div>

          <div className="text-sm text-slate-700 flex items-center gap-3">
            <span>Status: {progress.status}</span>
            {progress.total > 0 && (
              <span>
                {progress.current}/{progress.total}
              </span>
            )}
            {progress.status === "rendering" && (
              <span className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                <span
                  className="block h-full bg-emerald-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (progress.current / Math.max(1, progress.total)) * 100
                    )}%`
                  }}
                />
              </span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded p-3">
          {error}
        </div>
      )}

      <div className="border border-emerald-100 bg-emerald-50 rounded p-3 text-sm text-emerald-800">
        ffmpeg.wasm worker integration is planned; current implementation uses canvas-based
        frame sampling with the required crop/threshold/invert to mirror the final badge
        output until the wasm pipeline is wired.
      </div>

      <video ref={videoRef} className="hidden" preload="metadata" />
    </div>
  );
}
