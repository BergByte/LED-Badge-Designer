"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import {
  MAX_VIDEO_FRAMES,
  OUTPUT_ASPECT,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH
} from "@/config/constants";
import { BinaryFrame } from "@/types/frames";
import { createBlankFrame } from "@/utils/frameUtils";
import { PersistedVideoState } from "@/utils/persistence";

type Props = {
  fps: number;
  onFramesChange: (frames: BinaryFrame[]) => void;
  persistedState?: PersistedVideoState | null;
  onPersistState?: (state: PersistedVideoState | null) => void;
};

type VideoMeta = {
  name: string;
  duration: number;
  width: number;
  height: number;
};

type SourceKind = "video" | "gif";

type GifFrame = {
  bitmap: ImageBitmap;
  durationSeconds: number;
};

const MIN_GIF_FRAME_DURATION = 0.01;
const DEFAULT_GIF_FRAME_DURATION = 0.08;

type Progress = {
  current: number;
  total: number;
  status: "idle" | "preparing" | "rendering" | "cancelled" | "done";
};

const percentToPixels = (
  percent: { x: number; y: number; width: number; height: number },
  dimensions: { width: number; height: number }
): Area => ({
  x: percent.x * dimensions.width,
  y: percent.y * dimensions.height,
  width: percent.width * dimensions.width,
  height: percent.height * dimensions.height
});

const pixelsToPercent = (
  area: Area,
  dimensions: { width: number; height: number }
): { x: number; y: number; width: number; height: number } => {
  const width = Math.max(dimensions.width, 1);
  const height = Math.max(dimensions.height, 1);
  return {
    x: area.x / width,
    y: area.y / height,
    width: area.width / width,
    height: area.height / height
  };
};

export default function VideoPanel({
  fps,
  onFramesChange,
  persistedState,
  onPersistState
}: Props) {
  const persistedStateRef = useRef<PersistedVideoState | null>(persistedState ?? null);
  const lastPersistedRef = useRef<string>("");
  const initialCropFromPersisted =
    persistedState?.cropAreaPercent && persistedState.sourceDimensions
      ? percentToPixels(persistedState.cropAreaPercent, persistedState.sourceDimensions)
      : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const cropperVideoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const gifFramesRef = useRef<GifFrame[] | null>(null);
  const [gifFrames, setGifFrames] = useState<GifFrame[] | null>(null);
  const [startTime, setStartTime] = useState(persistedState?.startTime ?? 0);
  const [duration, setDuration] = useState<number | null>(persistedState?.duration ?? null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({
    current: 0,
    total: 0,
    status: "idle"
  });
  const [threshold, setThreshold] = useState(persistedState?.threshold ?? 128);
  const [invertOutput, setInvertOutput] = useState(persistedState?.invertOutput ?? false);
  const [crop, setCrop] = useState(persistedState?.crop ?? { x: 0, y: 0 });
  const [zoom, setZoom] = useState(persistedState?.zoom ?? 1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(
    initialCropFromPersisted
  );
  const cancelRef = useRef(false);
  const updateThreshold = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : threshold;
    const clamped = Math.min(255, Math.max(0, Math.round(safeValue)));
    setThreshold(clamped);
  };

  useEffect(() => {
    persistedStateRef.current = persistedState ?? null;
  }, [persistedState]);

  const getImageDecoder = () => {
    if (typeof window === "undefined") return null;
    const decoder = (window as typeof window & { ImageDecoder?: unknown }).ImageDecoder;
    if (typeof decoder !== "function") return null;
    return decoder as new (init: { data: BufferSource; type: string }) => {
      tracks?: { selectedTrack?: { frameCount: number } };
      decode: (options: { frameIndex: number }) => Promise<{ image: any }>;
      close?: () => void;
    };
  };

  const extractGifFrameDurations = (buffer: ArrayBuffer, maxFrames?: number) => {
    try {
      const view = new DataView(buffer);
      if (view.byteLength < 20) return [];
      const header = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3),
        view.getUint8(4),
        view.getUint8(5)
      );
      if (header !== "GIF87a" && header !== "GIF89a") {
        return [];
      }

      let offset = 6; // skip header
      if (offset + 7 > view.byteLength) return [];
      const lsdPacked = view.getUint8(offset + 4);
      offset += 7;
      if (lsdPacked & 0x80) {
        const gctSize = 3 * 2 ** ((lsdPacked & 0x07) + 1);
        offset += gctSize;
      }

      const durations: number[] = [];
      let delayCs = 1; // centiseconds, default to 10ms per GIF spec guidance

      const skipSubBlocks = () => {
        while (offset < view.byteLength) {
          const size = view.getUint8(offset++);
          if (size === 0) break;
          offset += size;
        }
      };

      while (offset < view.byteLength) {
        const blockId = view.getUint8(offset++);
        if (blockId === 0x21) {
          if (offset >= view.byteLength) break;
          const label = view.getUint8(offset++);
          if (label === 0xf9) {
            const blockSize = view.getUint8(offset++);
            if (blockSize === 4 && offset + 4 <= view.byteLength) {
              offset += 1; // packed field
              delayCs = view.getUint16(offset, true) || 1;
              offset += 2; // delay
              offset += 1; // transparent index
              offset += 1; // block terminator
            } else {
              offset += blockSize;
              offset += 1;
            }
          } else {
            skipSubBlocks();
          }
        } else if (blockId === 0x2c) {
          if (offset + 9 > view.byteLength) break;
          const packedFields = view.getUint8(offset + 8);
          offset += 9;
          if (packedFields & 0x80) {
            const lctSize = 3 * 2 ** ((packedFields & 0x07) + 1);
            offset += lctSize;
          }
          offset += 1; // LZW min code size
          skipSubBlocks(); // image data
          durations.push(Math.max(delayCs / 100, MIN_GIF_FRAME_DURATION));
          delayCs = 1;
          if (maxFrames && durations.length >= maxFrames) {
            break;
          }
        } else if (blockId === 0x3b) {
          break;
        } else {
          break;
        }
      }

      return durations;
    } catch (err) {
      console.warn("Unable to parse GIF frame durations", err);
      return [];
    }
  };

  const decodeGif = async (file: File) => {
    const ImageDecoderCtor = getImageDecoder();
    if (!ImageDecoderCtor) {
      throw new Error(
        "GIF decoding needs ImageDecoder support (Chrome/Edge 115+). Try converting to video if unsupported."
      );
    }
    const buffer = await file.arrayBuffer();
    const gifDurations = extractGifFrameDurations(buffer);
    const decoder = new ImageDecoderCtor({
      data: new Uint8Array(buffer),
      type: file.type || "image/gif"
    });
    const track = decoder.tracks?.selectedTrack;
    if (track && "ready" in track && track.ready instanceof Promise) {
      await track.ready;
    }
    // Prefer frame count from parsed GIF metadata since some browsers report 1 for
    // animated GIFs via ImageDecoder.tracks. Fall back to the decoder count.
    const totalFrames = Math.max(track?.frameCount ?? 0, gifDurations.length, 1);

    const frames: GifFrame[] = [];
    let width = 0;
    let height = 0;
    let totalDuration = 0;
    let usedDefaultDuration = false;

    for (let i = 0; i < totalFrames; i++) {
      try {
        const { image }: { image: any } = await decoder.decode({ frameIndex: i });
        width = image.displayWidth ?? image.codedWidth ?? width;
        height = image.displayHeight ?? image.codedHeight ?? height;
        const bitmap = await createImageBitmap(image);
        width = width || bitmap.width;
        height = height || bitmap.height;
        if (typeof image.close === "function") {
          image.close();
        }
        const rawDuration = image.duration ?? 0;
        const parsedDuration = gifDurations[i];
        const durationSeconds =
          parsedDuration !== undefined
            ? Math.max(parsedDuration, MIN_GIF_FRAME_DURATION)
            : rawDuration > 0
              ? Math.max(
                  rawDuration >= 10_000 ? rawDuration / 1_000_000 : rawDuration / 1000,
                  MIN_GIF_FRAME_DURATION
                )
              : (() => {
                  usedDefaultDuration = true;
                  return DEFAULT_GIF_FRAME_DURATION;
                })();
        totalDuration += durationSeconds;
        frames.push({ bitmap, durationSeconds });
      } catch (err) {
        if (i === 0) {
          decoder.close?.();
          throw new Error("Unable to decode GIF frames.");
        }
        break;
      }
    }

    decoder.close?.();
    if (!frames.length) {
      throw new Error("No frames found in the GIF.");
    }
    return { frames, width, height, duration: totalDuration, usedDefaultDuration };
  };

  const loadVideoMetadata = (file: File, url: string) =>
    new Promise<VideoMeta>((resolve, reject) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.playsInline = true;
      probe.addEventListener(
        "loadedmetadata",
        () => {
          resolve({
            name: file.name,
            duration: probe.duration,
            width: probe.videoWidth,
            height: probe.videoHeight
          });
        },
        { once: true }
      );
      probe.addEventListener(
        "error",
        () => {
          reject(new Error("Unable to read video metadata"));
        },
        { once: true }
      );
      probe.src = url;
      probe.load();
    });

  const cleanupGifFrames = (frames: GifFrame[] | null) => {
    frames?.forEach((frame) => {
      if (typeof frame.bitmap.close === "function") {
        frame.bitmap.close();
      }
    });
  };

  const setGifFramesWithCleanup = (frames: GifFrame[] | null) => {
    cleanupGifFrames(gifFramesRef.current);
    gifFramesRef.current = frames;
    setGifFrames(frames);
  };

  const centerCropArea = (videoWidth: number, videoHeight: number): Area => {
    const videoAspect = videoWidth / videoHeight;
    if (videoAspect > OUTPUT_ASPECT) {
      const targetWidth = OUTPUT_ASPECT * videoHeight;
      const sx = (videoWidth - targetWidth) / 2;
      return { x: sx, y: 0, width: targetWidth, height: videoHeight };
    }
    const targetHeight = videoWidth / OUTPUT_ASPECT;
    const sy = (videoHeight - targetHeight) / 2;
    return { x: 0, y: sy, width: videoWidth, height: targetHeight };
  };

  const initialCropArea = useMemo(() => {
    if (!meta) return null;
    if (croppedAreaPixels) return croppedAreaPixels;
    return centerCropArea(meta.width, meta.height);
  }, [croppedAreaPixels, meta]);

  const maxTrimSpanSeconds = useMemo(() => {
    return MAX_VIDEO_FRAMES / fps;
  }, [fps]);

  const clampTrim = (
    start: number,
    requestedDuration: number,
    videoDuration: number,
    spanLimitSeconds: number
  ) => {
    const durationCap = Math.min(Math.max(videoDuration, 0), spanLimitSeconds);
    const minDuration = durationCap > 0 ? Math.min(0.01, durationCap) : 0;
    const safeDuration = Number.isFinite(requestedDuration) ? requestedDuration : 0;
    const limitedDuration =
      durationCap > 0
        ? Math.min(Math.max(safeDuration, minDuration), durationCap)
        : 0;
    const clampedDuration = Math.max(minDuration, limitedDuration);
    const maxStart = Math.max(0, videoDuration - clampedDuration);
    const clampedStart = Math.min(Math.max(start, 0), maxStart);
    const end = Math.min(videoDuration, clampedStart + clampedDuration);

    return { start: clampedStart, duration: Math.max(minDuration, end - clampedStart), end };
  };

  const restoreTrim = (videoDuration: number, defaultDuration: number) => {
    const saved = persistedStateRef.current;
    if (!saved) return { start: 0, duration: defaultDuration };
    return clampTrim(
      saved.startTime ?? 0,
      saved.duration ?? defaultDuration,
      videoDuration,
      maxTrimSpanSeconds
    );
  };

  const restoreCropArea = (
    dimensions: { width: number; height: number },
    fallback: Area
  ): Area => {
    const saved = persistedStateRef.current;
    if (!saved || !saved.cropAreaPercent) return fallback;
    return percentToPixels(saved.cropAreaPercent, dimensions);
  };

  const trim = useMemo(() => {
    if (!meta || duration === null) return null;
    return clampTrim(startTime, duration, meta.duration, maxTrimSpanSeconds);
  }, [duration, maxTrimSpanSeconds, meta, startTime]);

  const effectiveDuration = trim?.duration ?? 0;
  const endTime = trim?.end ?? null;
  const maxDurationForSlider = meta
    ? Math.min(maxTrimSpanSeconds, Math.max(0, meta.duration - startTime))
    : 0;
  const maxStartForSlider = meta ? Math.max(0, meta.duration - effectiveDuration) : 0;

  const estimatedFrames = useMemo(() => {
    return Math.min(MAX_VIDEO_FRAMES, Math.ceil(effectiveDuration * fps));
  }, [effectiveDuration, fps]);

  const applyTrimChange = (nextStart: number, nextDuration: number) => {
    if (!meta || duration === null) return;
    const clamped = clampTrim(nextStart, nextDuration, meta.duration, maxTrimSpanSeconds);
    setStartTime(clamped.start);
    setDuration(clamped.duration);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setWarning(null);
    cancelRef.current = false;

    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }
    setMeta(null);
    setSourceKind(null);
    setGifFramesWithCleanup(null);
    setDuration(null);
    setStartTime(0);

    const isGif =
      file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");

    const url = URL.createObjectURL(file);
    setMediaUrl(url);
    setSourceKind(isGif ? "gif" : "video");

    try {
      if (isGif) {
        const decoded = await decodeGif(file);
        const cappedDuration = Math.min(decoded.duration, maxTrimSpanSeconds);
        setGifFramesWithCleanup(decoded.frames);
        setMeta({
          name: file.name,
          duration: decoded.duration,
          width: decoded.width,
          height: decoded.height
        });
        const restoredTrim = restoreTrim(decoded.duration, cappedDuration);
        setStartTime(restoredTrim.start);
        setDuration(restoredTrim.duration);
        const defaultCrop = centerCropArea(decoded.width, decoded.height);
        const restoredCrop = restoreCropArea(
          { width: decoded.width, height: decoded.height },
          defaultCrop
        );
        setCroppedAreaPixels(restoredCrop);
        setCrop(persistedStateRef.current?.crop ?? { x: 0, y: 0 });
        setZoom(persistedStateRef.current?.zoom ?? 1);
        if (decoded.usedDefaultDuration) {
          setWarning(
            `GIF is missing frame delay metadata; defaulting to ${DEFAULT_GIF_FRAME_DURATION.toFixed(
              2
            )}s per frame. Timing may differ from the original.`
          );
        }
        cropperVideoRef.current = null;
        const video = videoRef.current;
        if (video) {
          video.removeAttribute("src");
          video.load();
        }
        return;
      }

      const metaInfo = await loadVideoMetadata(file, url);
      const cappedDuration = Math.min(metaInfo.duration, maxTrimSpanSeconds);
      setGifFramesWithCleanup(null);
      setMeta(metaInfo);
      const restoredTrim = restoreTrim(metaInfo.duration, cappedDuration);
      setStartTime(restoredTrim.start);
      setDuration(restoredTrim.duration);
      const defaultCrop = centerCropArea(metaInfo.width, metaInfo.height);
      const restoredCrop = restoreCropArea(
        { width: metaInfo.width, height: metaInfo.height },
        defaultCrop
      );
      setCroppedAreaPixels(restoredCrop);
      setCrop(persistedStateRef.current?.crop ?? { x: 0, y: 0 });
      setZoom(persistedStateRef.current?.zoom ?? 1);

      const video = videoRef.current;
      if (video) {
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.src = url;
        video.load();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!trim) return;
    if (trim.start !== startTime) setStartTime(trim.start);
    if (trim.duration !== duration) setDuration(trim.duration);
  }, [duration, startTime, trim]);

  useEffect(() => {
    if (!onPersistState) return;
    const dimensions =
      meta && meta.width > 0 && meta.height > 0
        ? { width: meta.width, height: meta.height }
        : persistedStateRef.current?.sourceDimensions;
    const cropAreaPercent =
      meta && croppedAreaPixels && meta.width > 0 && meta.height > 0
        ? pixelsToPercent(croppedAreaPixels, { width: meta.width, height: meta.height })
        : persistedStateRef.current?.cropAreaPercent ?? null;
    const nextState: PersistedVideoState = {
      threshold,
      invertOutput,
      startTime,
      duration,
      zoom,
      crop,
      cropAreaPercent,
      sourceDimensions: dimensions,
      lastMediaName: meta?.name ?? persistedStateRef.current?.lastMediaName
    };
    const serialized = JSON.stringify(nextState);
    if (serialized === lastPersistedRef.current) return;
    lastPersistedRef.current = serialized;
    onPersistState(nextState);
  }, [
    crop,
    croppedAreaPixels,
    duration,
    invertOutput,
    meta,
    onPersistState,
    startTime,
    threshold,
    zoom
  ]);

  useEffect(() => {
    if (sourceKind !== "video") return;
    const node = cropperVideoRef.current;
    if (!node) return;

    const clamp = () => {
      if (endTime === null) return;
      if (node.currentTime < startTime || node.currentTime > endTime - 0.01) {
        node.currentTime = startTime;
      }
    };

    const handleLoaded = () => {
      node.currentTime = startTime;
    };

    node.loop = true;
    node.addEventListener("loadedmetadata", handleLoaded);
    node.addEventListener("timeupdate", clamp);
    node.addEventListener("seeking", clamp);
    clamp();

    return () => {
      node.removeEventListener("loadedmetadata", handleLoaded);
      node.removeEventListener("timeupdate", clamp);
      node.removeEventListener("seeking", clamp);
    };
  }, [cropperVideoRef, endTime, mediaUrl, sourceKind, startTime]);

  const thresholdFrame = (imageData: ImageData): Uint8ClampedArray => {
    const { data, width, height } = imageData;
    const out = new Uint8ClampedArray(width * height);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const val = gray >= threshold ? 0 : 255; // invert: >=threshold -> 0
      const finalVal = invertOutput ? (val === 0 ? 255 : 0) : val;
      const idx = i / 4;
      out[idx] = finalVal;
    }
    return out;
  };

  const renderFrames = async () => {
    if (!meta || endTime === null) return;
    if (sourceKind === "video" && !videoRef.current) return;
    if (sourceKind === "gif" && (!gifFrames || gifFrames.length === 0)) {
      setError("GIF frames are not ready yet. Re-upload and try again.");
      return;
    }
    if (effectiveDuration <= 0) {
      setError("Select a valid trim range.");
      return;
    }
    setError(null);
    cancelRef.current = false;
    setProgress({ current: 0, total: estimatedFrames, status: "preparing" });

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

    setProgress({ current: 0, total: frameCount, status: "rendering" });
    if (sourceKind === "gif" && gifFrames) {
      const timeline = gifFrames.reduce<
        { start: number; end: number; frame: GifFrame }[]
      >((acc, frame) => {
        const start = acc.length ? acc[acc.length - 1].end : 0;
        const end = start + frame.durationSeconds;
        acc.push({ start, end, frame });
        return acc;
      }, []);
      for (let i = 0; i < frameCount; i++) {
        if (cancelRef.current) {
          setProgress((prev) => ({ ...prev, status: "cancelled" }));
          return;
        }
        const t = startTime + i / fps;
        const clampedTime = Math.min(t, endTime - 0.001);
        const targetTime = Math.min(
          clampedTime,
          timeline[timeline.length - 1]?.end ?? clampedTime
        );
        let selectedFrame = timeline[timeline.length - 1]?.frame ?? null;
        for (const entry of timeline) {
          if (targetTime < entry.end) {
            selectedFrame = entry.frame;
            break;
          }
        }
        if (!selectedFrame) continue;
        ctx.drawImage(
          selectedFrame.bitmap,
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
        setProgress({
          current: i + 1,
          total: frameCount,
          status: "rendering"
        });
      }
    } else if (sourceKind === "video" && videoRef.current) {
      const video = videoRef.current;
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
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
      cleanupGifFrames(gifFramesRef.current);
    };
  }, [mediaUrl]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="card-title text-xl">Video/GIF → Badge</h3>
        </div>
      </div>

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text font-semibold">Upload video or GIF</span>
        </div>
        <input
          type="file"
          accept="video/*,image/gif"
          onChange={handleFileChange}
          className="file-input file-input-bordered w-full"
        />
      </label>

      {meta && endTime !== null && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="badge badge-outline">
              Duration: {meta.duration.toFixed(2)}s
            </span>
            <span className="badge badge-outline">
              Resolution: {meta.width}×{meta.height} · target {OUTPUT_ASPECT.toFixed(3)}
            </span>
            <span className="badge badge-secondary">FPS: {fps}</span>
            <span className="badge badge-accent">
              Max span: {Math.min(meta.duration, maxTrimSpanSeconds).toFixed(2)}s (
              {MAX_VIDEO_FRAMES} frames)
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
            <div className="relative h-72 w-full overflow-hidden rounded-2xl border border-base-300 bg-base-200">
              {mediaUrl ? (
                <Cropper
                  video={sourceKind === "video" ? mediaUrl : undefined}
                  image={sourceKind === "gif" ? mediaUrl : undefined}
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
                  mediaProps={
                    sourceKind === "video"
                      ? { controls: true, muted: true }
                      : { crossOrigin: "anonymous" }
                  }
                  setVideoRef={
                    sourceKind === "video"
                      ? (ref) => {
                          cropperVideoRef.current = ref?.current ?? null;
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm opacity-70">
                  Upload a video or GIF to adjust crop
                </div>
              )}
            </div>
            <div className="flex flex-col gap-4 text-sm">
              <div className="card-body gap-4 px-0">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">Zoom</div>
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
                    <div className="w-20 text-right text-sm tabular-nums">{zoom.toFixed(2)}×</div>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="range range-primary range-sm w-full"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">Threshold</div>
                      <p className="text-xs opacity-70">
                        Choose the cutoff used to convert grayscale into black/white pixels (higher = more black).
                      </p>
                    </div>
                    <input
                      id="threshold-input"
                      type="number"
                      min={0}
                      max={255}
                      step={1}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="input input-bordered input-sm w-20 text-right"
                      value={threshold}
                      onChange={(e) => updateThreshold(Number(e.target.value))}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    step={1}
                    className="range range-primary range-sm w-full"
                    value={threshold}
                    onChange={(e) => updateThreshold(Number(e.target.value))}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={invertOutput}
                    onChange={(e) => setInvertOutput(e.target.checked)}
                  />
                  <div className="text-sm">
                    <div className="font-semibold">Invert output</div>
                    <p className="text-xs opacity-70">
                      Flip black/white after thresholding.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">Trim start</div>
                      <p className="text-xs opacity-70">
                        Set where playback begins before rendering frames.
                      </p>
                    </div>
                    <input
                      type="number"
                      className="input input-bordered input-sm w-24 text-right"
                      value={startTime.toFixed(2)}
                      step={0.1}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        applyTrimChange(next, duration ?? effectiveDuration);
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxStartForSlider}
                    step={0.01}
                    value={startTime}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      applyTrimChange(next, duration ?? effectiveDuration);
                    }}
                    className="range range-primary range-sm w-full"
                  />
                </div>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">Duration</div>
                      <p className="text-xs opacity-70">
                        Control how long to render from the selected start time.
                      </p>
                    </div>
                    <input
                      type="number"
                      className="input input-bordered input-sm w-24 text-right"
                      value={(duration ?? effectiveDuration).toFixed(2)}
                      step={0.1}
                      min={0}
                      max={maxDurationForSlider.toFixed(2)}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        applyTrimChange(startTime, next);
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxDurationForSlider}
                    step={0.01}
                    value={duration ?? effectiveDuration}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      applyTrimChange(startTime, next);
                    }}
                    className="range range-primary range-sm w-full"
                  />
                </div>

              </div>
            </div>
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

      {warning && (
      <div className="alert alert-warning">
        <span>{warning}</span>
      </div>
      )}

      <video ref={videoRef} className="hidden" preload="metadata" />
    </div>
  );
}
