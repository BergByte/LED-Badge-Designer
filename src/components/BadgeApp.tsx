/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SPEED } from "@/config/constants";
import { SPEEDS, speedToFps } from "@/config/speeds";
import { BinaryFrame, RenderedSprite } from "@/types/frames";
import { createBlankFrame } from "@/utils/frameUtils";
import { renderFramesToSpritePNG } from "@/utils/spriteRenderer";
import PixelEditorPanel from "./PixelEditorPanel";
import VideoPanel from "./VideoPanel";

type Mode = "video" | "pixel";

const downloadSprite = (sprite: RenderedSprite, speed: number, fps: number) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `badge_sprite_speed${speed}_${fps}fps_${timestamp}.png`;
  const url = URL.createObjectURL(sprite.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const PreviewCanvas = ({
  frames,
  fps
}: {
  frames: BinaryFrame[];
  fps: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIndex = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();
    const interval = 1000 / fps;

    const render = () => {
      const now = performance.now();
      if (now - last >= interval) {
        const frame = frames[frameIndex.current % frames.length];
        const imageData = new ImageData(frame.width, frame.height);
        for (let i = 0; i < frame.data.length; i++) {
          const val = frame.data[i];
          const idx = i * 4;
          imageData.data[idx] = val;
          imageData.data[idx + 1] = val;
          imageData.data[idx + 2] = val;
          imageData.data[idx + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        frameIndex.current = frameIndex.current + 1;
        last = now;
      }
      rafRef.current = requestAnimationFrame(render);
    };

    render();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [frames, fps]);

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-slate-600 flex items-center gap-3">
        <span>Preview</span>
        <span className="rounded bg-slate-100 px-2 py-1">
          {frames.length} frame{frames.length === 1 ? "" : "s"}
        </span>
        <span className="rounded bg-slate-100 px-2 py-1">{fps} fps</span>
      </div>
      <canvas
        ref={canvasRef}
        width={48}
        height={11}
        className="border border-slate-200 rounded bg-white"
      />
    </div>
  );
};

const SpeedSelector = ({
  value,
  onChange
}: {
  value: number;
  onChange: (speed: number) => void;
}) => {
  return (
    <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
      <span>Speed</span>
      <select
        className="border border-slate-200 rounded px-2 py-1 bg-white"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {SPEEDS.map((entry) => (
          <option key={entry.speed} value={entry.speed}>
            Speed {entry.speed} — {entry.fps} fps
          </option>
        ))}
      </select>
    </label>
  );
};

const SpritePreview = ({ sprite }: { sprite: RenderedSprite | null }) => {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!sprite) return;
    const objectUrl = URL.createObjectURL(sprite.blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [sprite]);

  if (!sprite || !url) {
    return (
      <div className="text-sm text-slate-600">Render to see sprite preview.</div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm text-slate-600">
        Sprite: {sprite.width}×{sprite.height} ({sprite.frameCount} frames)
      </div>
      <img
        src={url}
        alt="Rendered sprite"
        className="border border-slate-200 rounded bg-white max-w-full"
      />
    </div>
  );
};

export default function BadgeApp() {
  const [mode, setMode] = useState<Mode>("video");
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [frames, setFrames] = useState<BinaryFrame[]>([createBlankFrame()]);
  const [sprite, setSprite] = useState<RenderedSprite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fps = useMemo(() => speedToFps(speed), [speed]);

  const handleRender = async () => {
    try {
      setError(null);
      const rendered = await renderFramesToSpritePNG(frames);
      setSprite(rendered);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDownload = () => {
    if (sprite) {
      downloadSprite(sprite, speed, fps);
    }
  };

  const onFramesChange = (updated: BinaryFrame[]) => {
    setFrames(updated);
    setSprite(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <header className="px-6 pt-8 pb-10 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-slate-50">
        <div className="max-w-5xl mx-auto flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
                <span className="px-3 py-1 rounded-full bg-emerald-600 text-white">
                  Client-only
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-900 text-white">
                  48×11 badge
                </span>
                <span className="px-3 py-1 rounded-full bg-white text-slate-700 border border-slate-200">
                  Static export / GitHub Pages
                </span>
              </div>
              <h1 className="text-3xl font-semibold">48×11 LED Badge Studio</h1>
              <p className="text-sm text-slate-700 max-w-2xl leading-6">
                Convert video trims or pixel art into a single-row, inverted monochrome
                sprite, preview it at the exact FPS, and get it ready to send to the
                Winbond 0416:5020 badge over WebHID/WebUSB.
              </p>
              <div className="flex gap-3 text-xs text-slate-700">
                <span className="px-3 py-1 rounded bg-white border border-slate-200">
                  Aspect: 48:11 · Output: PNG sprite
                </span>
                <span className="px-3 py-1 rounded bg-white border border-slate-200">
                  Threshold: ≥128 → 0 · else 255
                </span>
              </div>
            </div>
            <SpeedSelector value={speed} onChange={setSpeed} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="p-3 rounded border border-slate-200 bg-white shadow-sm">
              <div className="font-semibold text-slate-800">Status</div>
              <p className="text-slate-600">
                Pixel editor, preview, and sprite export are usable now. Video trim pipeline
                and device transport are being wired in next.
              </p>
            </div>
            <div className="p-3 rounded border border-slate-200 bg-white shadow-sm">
              <div className="font-semibold text-slate-800">Preview fidelity</div>
              <p className="text-slate-600">
                Renders at 48×11 with inverted binary threshold and your selected FPS to
                mirror badge playback.
              </p>
            </div>
            <div className="p-3 rounded border border-slate-200 bg-white shadow-sm">
              <div className="font-semibold text-slate-800">Deployment</div>
              <p className="text-slate-600">
                Configured for static export with `basePath/assetPrefix` so GitHub Pages can
                host everything without a backend.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex gap-3">
          {[
            { id: "video", label: "Video → Badge" },
            { id: "pixel", label: "Pixel Animation → Badge" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id as Mode)}
              className={`px-4 py-2 rounded border ${
                mode === tab.id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white border-slate-200 text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            {mode === "video" ? (
              <VideoPanel fps={fps} onFramesChange={onFramesChange} />
            ) : (
              <PixelEditorPanel fps={fps} frames={frames} onChange={onFramesChange} />
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex flex-col gap-4">
            <PreviewCanvas frames={frames} fps={fps} />
            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2 rounded bg-emerald-600 text-white font-semibold"
                onClick={handleRender}
              >
                Render Sprite
              </button>
              <button
                className="flex-1 px-3 py-2 rounded border border-slate-200 text-slate-800 bg-white"
                onClick={handleDownload}
                disabled={!sprite}
              >
                Download
              </button>
            </div>
            {error && (
              <div className="text-sm text-red-600 border border-red-100 bg-red-50 px-3 py-2 rounded">
                {error}
              </div>
            )}
            <SpritePreview sprite={sprite} />
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            <h3 className="text-base font-semibold mb-2">Video flow (soon)</h3>
            <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1">
              <li>Upload .mp4/.mov/.webm</li>
              <li>Trim within max duration and center-crop to 48:11</li>
              <li>Extract frames at chosen FPS, invert/threshold, tile to sprite</li>
              <li>Preview, then render and download the PNG</li>
            </ol>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            <h3 className="text-base font-semibold mb-2">Pixel animation flow</h3>
            <ol className="list-decimal list-inside text-sm text-slate-700 space-y-1">
              <li>Draw on 48×11 grid with pen/erase/fill</li>
              <li>Add/duplicate/delete/reorder frames in the timeline</li>
              <li>Preview at Speed N (FPS) and inspect sprite width</li>
              <li>Render and download the single-row PNG</li>
            </ol>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            <h3 className="text-base font-semibold mb-2">Send to badge (next)</h3>
            <p className="text-sm text-slate-700">
              WebHID/WebUSB transport with frame bit-packing and speed metadata will land
              once the device protocol is confirmed. The connect/send controls will appear
              below the preview panel.
            </p>
          </div>
        </section>

        <footer className="text-xs text-slate-500 pb-8">
          Runs locally in your browser. Best in Chromium-based browsers with WebHID/WebUSB
          support. Static export ready for GitHub Pages.
        </footer>
      </main>
    </div>
  );
}
