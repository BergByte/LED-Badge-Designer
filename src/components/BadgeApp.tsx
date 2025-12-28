/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SPEED, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/config/constants";
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
            width={OUTPUT_WIDTH}
            height={OUTPUT_HEIGHT}
            className="border border-dashed border-base-300 rounded bg-base-100 w-full"
            style={{
              height: "auto",
              imageRendering: "pixelated",
              aspectRatio: `${OUTPUT_WIDTH} / ${OUTPUT_HEIGHT}`
            }}
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
  const [frames, setFrames] = useState<BinaryFrame[]>(() => [createBlankFrame()]);
  const framesRef = useRef<BinaryFrame[]>([]);
  const [sprite, setSprite] = useState<RenderedSprite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const fps = useMemo(() => speedToFps(speed), [speed]);
  const uploadCommand = useMemo(
    () => `python3 lednamebadge.py -m 5 -s ${speed} :/foo/bar.png:`,
    [speed]
  );

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  const handleRender = async () => {
    try {
      setError(null);
      const rendered = await renderFramesToSpritePNG(framesRef.current);
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
    framesRef.current = updated;
    setFrames(updated);
    setSprite(null);
  };

  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <header className="bg-gradient-to-r from-primary/20 via-base-200 to-secondary/10">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold">48×11 LED Badge Studio</h1>
              <p className="text-sm opacity-80 max-w-3xl leading-6">
                Trim or draw a 48×11 animation, preview it at badge playback speed, and export a single-row sprite PNG ready for the Winbond 0416:5020 badge.
              </p>
            </div>
            <SpeedSelector value={speed} onChange={setSpeed} />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">
        <div role="tablist" className="tabs tabs-boxed w-fit bg-base-100 shadow">
          {[
            { id: "video", label: "Video/GIF → Badge" },
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
                <div className="bg-white border border-base-300 rounded p-3 text-xs space-y-1">
                  <div className="font-semibold">Upload command (uses selected speed)</div>
                  <pre className="whitespace-pre-wrap text-[11px] leading-5">
{uploadCommand}
                  </pre>
                </div>
                <div className="flex justify-end">
                  <button className="btn btn-outline btn-sm" onClick={() => setShowSteps(true)}>
                    How to upload
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card bg-base-100 shadow-sm border border-base-300">
            <div className="card-body gap-2">
              <h3 className="card-title text-base">Video flow</h3>
              <ol className="list-decimal list-inside text-sm opacity-80 space-y-1">
                <li>Upload .mp4/.mov/.webm or animated .gif</li>
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
              <div className="text-sm opacity-80 space-y-2">
                <div>
                  <span className="font-semibold">Designer UI repo: </span>
                  <a className="link" href="https://github.com/BergByte/LED-Badge-Designer">
                    https://github.com/BergByte/LED-Badge-Designer
                  </a>
                </div>
                <div>
                  <span className="font-semibold">Upload CLI tool: </span>
                  <a className="link" href="https://github.com/jnweiger/led-name-badge-ls32">
                    https://github.com/jnweiger/led-name-badge-ls32
                  </a>
                </div>
                <div>
                  <span className="font-semibold">Alternate firmware support: </span>
                  <a className="link" href="https://github.com/fossasia/badgemagic-firmware">
                    https://github.com/fossasia/badgemagic-firmware
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="text-xs opacity-70 pb-8">
        </footer>
      </main>

      {showSteps && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Use the downloaded sprite with the CLI uploader</div>
                <p className="text-sm opacity-80">
                  These steps clone the badge uploader, place you in the project directory, and send your exported sprite to the badge.
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSteps(false)}>
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-semibold">1) Clone the uploader repo</div>
                <p className="opacity-80">Download the LED badge command-line tools and scripts.</p>
                <pre className="bg-base-200 text-xs rounded p-3 overflow-x-auto">
git clone https://github.com/jnweiger/led-name-badge-ls32.git
                </pre>
              </div>
              <div>
                <div className="font-semibold">2) Enter the project folder</div>
                <p className="opacity-80">Switch into the cloned directory so the CLI can find its assets.</p>
                <pre className="bg-base-200 text-xs rounded p-3 overflow-x-auto">
cd led-name-badge-ls32
                </pre>
              </div>
              <div>
                <div className="font-semibold">3) Upload your sprite</div>
                <p className="opacity-80">
                  Point the uploader at the PNG you downloaded here, set mode 5, and send it to the badge at your selected speed.
                </p>
                <pre className="bg-base-200 text-xs rounded p-3 overflow-x-auto">
{uploadCommand}
                </pre>
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-primary btn-sm" onClick={() => setShowSteps(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
