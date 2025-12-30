/* eslint-disable @next/next/no-img-element */
"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BADGE_DEVICE,
  DEFAULT_SPEED,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH
} from "@/config/constants";
import { SPEEDS, speedToFps } from "@/config/speeds";
import { BinaryFrame, RenderedSprite } from "@/types/frames";
import { cloneFrame, createBlankFrame } from "@/utils/frameUtils";
import { downloadFrameFile, readFrameFile } from "@/utils/frameFile";
import { ExampleAnimation, loadExamplesFromPublic } from "@/utils/exampleLoader";
import {
  hydrateFrames,
  loadAppState,
  PersistedVideoState,
  saveAppState,
  serializeFrames
} from "@/utils/persistence";
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

const TutorialModal = ({
  open,
  onClose,
  uploadCommand
}: {
  open: boolean;
  onClose: () => void;
  uploadCommand: string;
}) => {
  const vendorHex = BADGE_DEVICE.usbVendorId.toString(16).padStart(4, "0");
  const productHex = BADGE_DEVICE.usbProductId.toString(16).padStart(4, "0");
  const badgeUsbId = `${vendorHex}:${productHex}`;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden border border-base-300">
        <div className="flex items-start justify-between gap-4 p-5 border-b border-base-200">
          <div>
            <div className="text-lg font-semibold">Badge workflow tutorial</div>
            <p className="text-sm opacity-70">
              Convert a video or pixel animation to a sprite row, then push it to the Winbond {badgeUsbId} badge.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(80vh-5rem)] pr-3">
          <section className="space-y-2">
            <h3 className="font-semibold text-base">1) Start from a video or GIF</h3>
            <ul className="list-disc list-inside text-sm opacity-80 space-y-1">
              <li>Upload .mp4/.mov/.webm or animated GIF; keep clips short—sprites are capped to 80 frames.</li>
              <li>
                Use Trim Start plus Duration to keep only the span you need; estimated frame count updates with the selected speed.
              </li>
              <li>The crop box is locked to 48:11. Pan/zoom to choose the region that will be scaled down to 48×11.</li>
              <li>Processing is in-browser: the app scales, converts to grayscale, thresholds (≥128 → black), and inverts for the badge.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">2) Edit or draw pixel frames</h3>
            <ul className="list-disc list-inside text-sm opacity-80 space-y-1">
              <li>Switch to the Pixel tab to sketch at 48×11 with dot/line/rect tools.</li>
              <li>Manage the timeline: add, duplicate, delete, and reorder frames (capped at 120).</li>
              <li>Speed presets map to FPS (e.g., Speed 8 → 15 fps); preview updates instantly.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">3) Render the sprite</h3>
            <ul className="list-disc list-inside text-sm opacity-80 space-y-1">
              <li>Click Render Sprite to tile frames into one horizontal row at 48×11 each.</li>
              <li>Use Download to save the PNG (filename includes speed and FPS for later reference).</li>
              <li>Sprite width = frame count × 48; height = 11. Preview verifies the inversion/threshold output.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">4) First-time CLI setup of <a target="_blank" href="https://github.com/jnweiger/led-name-badge-ls32">github.com/jnweiger/led-name-badge-ls32</a></h3>
            <p className="text-sm opacity-80">
              The uploader script in <code>led-name-badge-ls32</code> expects Python 3, Pillow for PNG parsing, and USB access.<br/>
              <b>For more information and help check out <a target="_blank" href="https://github.com/jnweiger/led-name-badge-ls32">github.com/jnweiger/led-name-badge-ls32</a></b>
            </p>
            <div className="rounded border border-base-300 bg-base-100 p-3 text-xs space-y-2">
              <div className="font-semibold">Install and prepare</div>
              <pre className="bg-base-200 rounded p-3 whitespace-pre-wrap">
git clone https://github.com/jnweiger/led-name-badge-ls32.git<br/>
cd led-name-badge-ls32<br/>
sudo apt install python3-venv<br/>
python -m venv ledtag<br/>
source ledtag/bin/activate<br/>
pip install pyhidapi pyusb pillow<br/>
# this should now work:<br/>
# python led-badge-11x44.py -m 6 -s 8 "Hello" "World!"<br/>
              </pre>
              <p className="opacity-80">
                Linux users: add a udev rule so the badge is accessible without sudo.
              </p>
              <pre className="bg-base-200 rounded p-3 whitespace-pre-wrap">
                sudo cp 99-led-badge-44x11.rules /etc/udev/rules.d/<br />
                sudo udevadm control --reload-rules && sudo udevadm trigger</pre>
              <p className="opacity-80">
                Unplug/replug the badge after adding the rule. On macOS/Windows, plug in and let the OS finish driver setup (no rule needed).
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-base">5) Upload your sprite</h3>
            <p className="text-sm opacity-80">
              Connect the badge over USB, then point the CLI at your downloaded PNG. Use the speed set in the app so playback matches.
            </p>
            <pre className="bg-base-200 rounded p-3 text-xs whitespace-pre-wrap">{uploadCommand}</pre>
            <ul className="list-disc list-inside text-sm opacity-80 space-y-1">
              <li>Replace the placeholder path with your sprite file. Mode <code>-m 5</code> is the PNG animation mode of the badge.</li>
              <li>If the badge is not detected, confirm the udev rule, reconnect the device, and retry the command.</li>
              <li>Re-render at a different speed if you want faster or slower playback, then rerun the upload command.</li>
            </ul>
          </section>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-base-200">
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default function BadgeApp() {
  const [mode, setMode] = useState<Mode>("video");
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [frames, setFrames] = useState<BinaryFrame[]>(() => [createBlankFrame()]);
  const framesRef = useRef<BinaryFrame[]>([]);
  const [examples, setExamples] = useState<ExampleAnimation[]>([]);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [hydratedFromStorage, setHydratedFromStorage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const examplesScrollRef = useRef<HTMLDivElement>(null);
  const [videoState, setVideoState] = useState<PersistedVideoState | null>(null);
  const videoStateRef = useRef<PersistedVideoState | null>(null);
  const [sprite, setSprite] = useState<RenderedSprite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const fps = useMemo(() => speedToFps(speed), [speed]);
  const uploadCommand = useMemo(
    () => `python3 lednamebadge.py -m 5 -s ${speed} :/path/to/downloaded/sprite.png:`,
    [speed]
  );

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    videoStateRef.current = videoState;
  }, [videoState]);

  useEffect(() => {
    const stored = loadAppState();
    if (stored) {
      if (stored.mode === "video" || stored.mode === "pixel") {
        setMode(stored.mode);
      }
      if (typeof stored.speed === "number" && Number.isFinite(stored.speed)) {
        setSpeed(stored.speed);
      }
      const hydrated = hydrateFrames(stored.frames);
      if (hydrated.length) {
        framesRef.current = hydrated;
        setFrames(hydrated);
      }
      if (stored.video) {
        setVideoState(stored.video);
      }
    }
    setHydratedFromStorage(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadExamples = async () => {
      const loaded = await loadExamplesFromPublic();
      if (cancelled) return;
      setExamples(loaded);
      if (!loaded.length) {
        setExamplesError("No examples available.");
      } else {
        setExamplesError(null);
      }
    };
    loadExamples();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydratedFromStorage) return;
    if (framesRef.current.length) return;
    if (!examples.length) return;
    const first = examples[0];
    const exampleFrames = first.frames.map((frame) => cloneFrame(frame));
    framesRef.current = exampleFrames;
    setFrames(exampleFrames);
    setMode("pixel");
    if (typeof first.speed === "number") {
      setSpeed(first.speed);
    }
  }, [examples, hydratedFromStorage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = window.setTimeout(() => {
      saveAppState({
        mode,
        speed,
        frames: serializeFrames(frames),
        video: videoStateRef.current
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [frames, mode, speed, videoState]);

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

  const handleSaveFramesToFile = () => {
    try {
      if (!framesRef.current.length) {
        setError("No frames to save.");
        return;
      }
      downloadFrameFile(framesRef.current, speed);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLoadFramesClick = () => {
    fileInputRef.current?.click();
  };

  const handleFramesFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await readFrameFile(file);
      onFramesChange(result.frames);
      setMode("pixel");
      if (typeof result.speed === "number" && Number.isFinite(result.speed)) {
        setSpeed(result.speed);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      event.target.value = "";
    }
  };

  const applyExample = (example: ExampleAnimation) => {
    const exampleFrames = example.frames.map((frame) => cloneFrame(frame));
    onFramesChange(exampleFrames);
    setMode("pixel");
    if (typeof example.speed === "number" && Number.isFinite(example.speed)) {
      setSpeed(example.speed);
    }
    setError(null);
  };

  const scrollExamples = (direction: "left" | "right") => {
    const node = examplesScrollRef.current;
    if (!node) return;
    const delta = direction === "left" ? -260 : 260;
    node.scrollBy({ left: delta, behavior: "smooth" });
  };

  const handlePersistVideoState = (state: PersistedVideoState | null) => {
    setVideoState(state);
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
        {(examples.length > 0 || examplesError) && (
          <section className="card bg-base-100 shadow-md border border-base-300">
            <div className="card-body gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Quick-start examples</h3>
                  <p className="text-sm opacity-80">
                    Loaded automatically on first visit. Pick another to replace your current pixel frames.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-outline">
                    {examples.length} example{examples.length === 1 ? "" : "s"}
                  </span>
                  <div className="join">
                    <button className="btn btn-outline btn-xs join-item" onClick={() => scrollExamples("left")}>
                      ←
                    </button>
                    <button className="btn btn-outline btn-xs join-item" onClick={() => scrollExamples("right")}>
                      →
                    </button>
                  </div>
                </div>
              </div>
              {examplesError ? (
                <div className="alert alert-warning">
                  <span>{examplesError}</span>
                </div>
              ) : (
                <div
                  ref={examplesScrollRef}
                  className="flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
                >
                  {examples.map((example) => (
                    <div
                      key={example.id}
                      className="card bg-base-200/70 border border-base-300 min-w-[220px] max-w-xs shadow-sm snap-start"
                    >
                      <div className="card-body gap-3">
                        <div>
                          <div className="font-semibold text-sm">{example.title}</div>
                          <p className="text-xs opacity-75 leading-5">{example.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="badge badge-ghost">
                            {example.frames.length} frames
                          </span>
                          {example.speed && (
                            <span className="badge badge-outline">Speed {example.speed}</span>
                          )}
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => applyExample(example)}>
                          Load example
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

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
                  <VideoPanel
                    fps={fps}
                    onFramesChange={onFramesChange}
                    persistedState={videoState}
                    onPersistState={handlePersistVideoState}
                  />
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
                <div className="flex gap-2">
                  <button className="btn btn-outline btn-sm flex-1" onClick={handleSaveFramesToFile}>
                    Save frames to file
                  </button>
                  <button className="btn btn-outline btn-sm flex-1" onClick={handleLoadFramesClick}>
                    Load frames from file
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
                  <pre className="whitespace-pre-wrap text-[11px] leading-5">{uploadCommand}</pre>
                </div>
                <div className="flex justify-end">
                  <button className="btn btn-outline btn-sm" onClick={() => setShowTutorial(true)}>
                    Help
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
                  <span className="font-semibold">Our GitHub: </span>
                  <a className="link" href="https://github.com/BergByte/LED-Badge-Designer">
                    https://github.com/BergByte/LED-Badge-Designer
                  </a>
                </div>
                <div> 
                  <span className="font-semibold">LED Name Badge LS32 (CLI tool): </span>
                  <a className="link" href="https://github.com/jnweiger/led-name-badge-ls32">
                    https://github.com/jnweiger/led-name-badge-ls32
                  </a>
                </div>
                <div>
                  <span className="font-semibold">Alternate firmware for the badge: </span>
                  <a className="link" href="https://github.com/fossasia/badgemagic-firmware">
                    https://github.com/fossasia/badgemagic-firmware
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="text-xs opacity-70 pb-8">
          <div className="max-w-6xl mx-auto flex flex-col gap-2">
            <span>Runs fully in your browser—media and sprites stay on-device.</span>
            <span>
              Best in Chromium-based browsers for WebUSB/WebHID; Safari/Firefox may not expose
              badge connectivity.
            </span>
            <span>Targeted for Winbond 0416:5020 48×11 badges, sprite export only.</span>
          </div>
        </footer>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFramesFileSelected}
      />

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
                <pre className="bg-base-200 text-xs rounded p-3 overflow-x-auto">{uploadCommand}</pre>
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

      <button
        className="btn btn-primary btn-circle shadow-lg fixed bottom-6 right-6 z-40"
        onClick={() => setShowTutorial(true)}
        aria-label="Open tutorial"
        title="Open tutorial"
      >
        ?
      </button>

      <TutorialModal
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        uploadCommand={uploadCommand}
      />
    </div>
  );
}
