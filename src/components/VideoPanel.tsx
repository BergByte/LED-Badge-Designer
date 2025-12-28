"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
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
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({
    current: 0,
    total: 0,
    status: "idle"
  });
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const cancelRef = useRef(false);

  const initialCropArea = useMemo(() => {
    if (!meta) return null;
    return centerCropArea(meta.width, meta.height);
  }, [meta]);

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
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(url);
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
      const defaultCrop = centerCropArea(video.videoWidth, video.videoHeight);
      setCroppedAreaPixels(defaultCrop);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
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

  const centerCropArea = (videoWidth: number, videoHeight: number): Area => {
    const videoAspect = videoWidth / videoHeight;
    if (videoAspect > OUTPUT_ASPECT) {
      // Too wide, crop sides
      const targetWidth = OUTPUT_ASPECT * videoHeight;
      const sx = (videoWidth - targetWidth) / 2;
      return { x: sx, y: 0, width: targetWidth, height: videoHeight };
    }
    // Too tall, crop top/bottom
    const targetHeight = videoWidth / OUTPUT_ASPECT;
    const sy = (videoHeight - targetHeight) / 2;
    return { x: 0, y: sy, width: videoWidth, height: targetHeight };
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
    const cropArea =
      croppedAreaPixels ?? centerCropArea(meta.width, meta.height);
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
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
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
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="card-title text-xl">Video → Badge</h3>
          <p className="text-sm opacity-70">
            Upload a clip, trim to {MAX_VIDEO_DURATION_SECONDS}s, crop to 48:11, and render
            at the selected FPS (inverted binary).
          </p>
        </div>
        <button
          className="btn btn-link btn-sm"
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

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text font-semibold">Upload video</span>
        </div>
        <input
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="file-input file-input-bordered w-full"
        />
      </label>

      {meta && endTime !== null && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge badge-outline">File: {meta.name}</span>
            <span className="badge badge-outline">
              Duration: {meta.duration.toFixed(2)}s (cap {MAX_VIDEO_DURATION_SECONDS}s)
            </span>
            <span className="badge badge-outline">
              Resolution: {meta.width}×{meta.height} · target {OUTPUT_ASPECT.toFixed(3)}
            </span>
            <span className="badge badge-outline">
              Output: {OUTPUT_WIDTH}×{OUTPUT_HEIGHT}
            </span>
            <span className="badge badge-secondary">FPS: {fps}</span>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
            <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-base-300 bg-base-200">
              {videoUrl ? (
                <Cropper
                  video={videoUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={OUTPUT_ASPECT}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                  objectFit="contain"
                  minZoom={1}
                  maxZoom={5}
                  restrictPosition
                  initialCroppedAreaPixels={initialCropArea ?? undefined}
                  mediaProps={{ controls: true, muted: true }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm opacity-70">
                  Upload a video to adjust crop
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Crop is locked to the badge aspect (48:11). Drag to reposition and use zoom
                to punch in before scaling down to 48×11.
              </p>
              <label className="form-control">
                <div className="label">
                  <span className="label-text">Zoom</span>
                  <span className="label-text-alt">{zoom.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="range range-primary"
                />
              </label>
              <span className="text-xs opacity-70">
                Crop area:{" "}
                {croppedAreaPixels
                  ? `${Math.round(croppedAreaPixels.width)}×${Math.round(
                      croppedAreaPixels.height
                    )} @ (${Math.round(croppedAreaPixels.x)}, ${Math.round(
                      croppedAreaPixels.y
                    )})`
                  : "Using centered crop"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm opacity-80">
              <span>
                Trim start: {startTime.toFixed(2)}s · Trim end: {endTime.toFixed(2)}s
              </span>
              <span>
                Span: {effectiveDuration.toFixed(2)}s · Est. frames: {estimatedFrames}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <label className="form-control w-full">
                <div className="label">
                  <span className="label-text text-xs">Start</span>
                  <span className="label-text-alt text-xs">
                    {startTime.toFixed(2)}s
                  </span>
                </div>
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
                  className="range range-secondary"
                />
              </label>
              <input
                type="number"
                className="input input-bordered input-sm w-24"
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
            <div className="flex items-center gap-4">
              <label className="form-control w-full">
                <div className="label">
                  <span className="label-text text-xs">End</span>
                  <span className="label-text-alt text-xs">{endTime.toFixed(2)}s</span>
                </div>
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
                  className="range range-secondary"
                />
              </label>
              <input
                type="number"
                className="input input-bordered input-sm w-24"
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
            <p className="text-xs opacity-70">
              Aspect policy: crop locked to 48:11 (default is centered), nearest-neighbor
              scale to 48×11, then grayscale → threshold (≥128→0, else 255).
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              onClick={renderFrames}
              disabled={progress.status === "rendering"}
            >
              Render frames from video
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                cancelRef.current = true;
              }}
              disabled={progress.status !== "rendering"}
            >
              Cancel
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                setError(null);
                onFramesChange([createBlankFrame()]);
              }}
            >
              Clear frames
            </button>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="badge badge-ghost">Status: {progress.status}</span>
              {progress.total > 0 && (
                <span className="badge badge-outline">
                  {progress.current}/{progress.total}
                </span>
              )}
            </div>
            {progress.status === "rendering" && (
              <progress
                className="progress progress-primary"
                value={progress.current}
                max={progress.total}
              />
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="alert alert-success">
        ffmpeg.wasm worker integration is planned; current implementation uses canvas-based
        frame sampling with the required crop/threshold/invert to mirror the final badge
        output until the wasm pipeline is wired.
      </div>

      <video ref={videoRef} className="hidden" preload="metadata" />
    </div>
  );
}
