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
  const rafRef = useRef<number | undefined>(undefined);

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
    <div className="card bg-base-100 shadow-md">
      <div className="card-body gap-3">
        <div className="badge badge-secondary">Live preview</div>
        <div className="flex items-center gap-2 text-sm opacity-70">
          <span className="badge badge-ghost">
            {frames.length} frame{frames.length === 1 ? "" : "s"}
          </span>
          <span className="badge badge-outline">{fps} fps</span>
        </div>
        <div className="rounded-lg border border-base-300 bg-white p-3">
          <canvas
            ref={canvasRef}
            width={48}
            height={11}
            className="border border-dashed border-base-300 rounded bg-base-100"
          />
        </div>
      </div>
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
    <label className="form-control w-full max-w-xs">
      <div className="label">
        <span className="label-text font-semibold">Speed / FPS</span>
      </div>
      <select
        className="select select-bordered select-sm bg-base-100"
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
      <div className="alert alert-info">
        <span>Render to see sprite preview.</span>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm opacity-70">
          <span className="badge badge-outline">
            {sprite.width}×{sprite.height}
          </span>
          <span className="badge badge-ghost">{sprite.frameCount} frames</span>
        </div>
        <figure className="overflow-x-auto rounded border border-base-300 bg-white p-3">
          <img
            src={url}
            alt="Rendered sprite"
            className="max-w-full h-auto"
          />
        </figure>
      </div>
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
    <div className="min-h-screen bg-base-200 text-base-content">
      <header className="bg-gradient-to-r from-primary/20 via-base-200 to-secondary/10">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
                <span className="badge badge-primary badge-lg">Client-only</span>
                <span className="badge badge-neutral badge-lg">48×11 badge</span>
                <span className="badge badge-outline badge-lg">Static export</span>
              </div>
              <div>
                <p className="badge badge-info badge-outline">Video & Pixel → Sprite</p>
                <h1 className="text-4xl font-bold mt-2">48×11 LED Badge Studio</h1>
                <p className="text-sm opacity-80 max-w-3xl leading-6 mt-2">
                  Trim or draw, lock to 48:11, invert to monochrome, preview at exact FPS,
                  and export a single-row sprite ready for the Winbond 0416:5020 badge
                  (WebHID/WebUSB planned).
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs opacity-80">
                <span className="badge badge-outline">Aspect 48:11 · Output PNG</span>
                <span className="badge badge-outline">Threshold ≥128 → 0</span>
              </div>
            </div>
            <SpeedSelector value={speed} onChange={setSpeed} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body gap-2">
                <div className="card-title text-base">Status</div>
                <p className="opacity-80">
                  Video trim + crop and pixel editor both render binary frames; sprite
                  export is live. Device transport is queued next.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body gap-2">
                <div className="card-title text-base">Preview fidelity</div>
                <p className="opacity-80">
                  Renders at 48×11 with inverted binary threshold and your selected FPS to
                  mirror badge playback.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 shadow-sm border border-base-300">
              <div className="card-body gap-2">
                <div className="card-title text-base">Deployment</div>
                <p className="opacity-80">
                  Configured for static export with basePath/assetPrefix so GitHub Pages can
                  host everything without a backend.
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div role="tablist" className="tabs tabs-boxed w-fit bg-base-100 shadow">
          {[
            { id: "video", label: "Video → Badge" },
            { id: "pixel", label: "Pixel Animation → Badge" }
          ].map((tab) => (
            <button
              role="tab"
              key={tab.id}
              onClick={() => setMode(tab.id as Mode)}
              className={`tab ${mode === tab.id ? "tab-active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="card bg-base-100 shadow-xl border border-base-300">
              <div className="card-body">
                {mode === "video" ? (
                  <VideoPanel fps={fps} onFramesChange={onFramesChange} />
                ) : (
                  <PixelEditorPanel fps={fps} frames={frames} onChange={onFramesChange} />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <PreviewCanvas frames={frames} fps={fps} />
            <div className="card bg-base-100 shadow-md border border-base-300">
              <div className="card-body gap-3">
                <div className="flex gap-2">
                  <button className="btn btn-primary flex-1" onClick={handleRender}>
                    Render Sprite
                  </button>
                  <button
                    className="btn btn-outline flex-1"
                    onClick={handleDownload}
                    disabled={!sprite}
                  >
                    Download
                  </button>
                </div>
                {error && (
                  <div className="alert alert-error text-sm">
                    <span>{error}</span>
                  </div>
                )}
                <SpritePreview sprite={sprite} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body gap-2">
              <h3 className="card-title text-base">Video flow</h3>
              <ol className="list-decimal list-inside text-sm opacity-80 space-y-1">
                <li>Upload .mp4/.mov/.webm</li>
                <li>Trim within max duration and crop to 48:11</li>
                <li>Extract frames at chosen FPS, invert/threshold, tile to sprite</li>
                <li>Preview, then render and download the PNG</li>
              </ol>
            </div>
          </div>
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body gap-2">
              <h3 className="card-title text-base">Pixel animation flow</h3>
              <ol className="list-decimal list-inside text-sm opacity-80 space-y-1">
                <li>Draw on 48×11 grid with pen/erase/fill</li>
                <li>Add/duplicate/delete/reorder frames in the timeline</li>
                <li>Preview at Speed N (FPS) and inspect sprite width</li>
                <li>Render and download the single-row PNG</li>
              </ol>
            </div>
          </div>
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body gap-2">
              <h3 className="card-title text-base">Send to badge (next)</h3>
              <p className="text-sm opacity-80">
                WebHID/WebUSB transport with frame bit-packing and speed metadata will land
                once the device protocol is confirmed. The connect/send controls will appear
                below the preview panel.
              </p>
            </div>
          </div>
        </section>

        <footer className="text-xs opacity-70 pb-8">
          Runs locally in your browser. Best in Chromium-based browsers with WebHID/WebUSB
          support. Static export ready for GitHub Pages.
        </footer>
      </main>
    </div>
  );
}
