"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_FRAMES, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/config/constants";
import { speedToFps } from "@/config/speeds";
import { BinaryFrame } from "@/types/frames";
import { cloneFrame, createBlankFrame } from "@/utils/frameUtils";
import {
  BrushTool,
  CanvasDataChangeParams,
  CanvasStrokeEndParams,
  Dotting,
  DottingRef,
  PixelModifyItem
} from "dotting";

type Props = {
  frames: BinaryFrame[];
  fps: number;
  onChange: (frames: BinaryFrame[]) => void;
};

const BLACK = "#000000";
const WHITE = "#ffffff";
const LAYER_ID = "frame-layer";

const clampFrames = (frames: BinaryFrame[]) =>
  frames.slice(0, MAX_FRAMES || frames.length);

const frameToLayerData = (frame: BinaryFrame): PixelModifyItem[][] =>
  Array.from({ length: OUTPUT_HEIGHT }, (_, rowIndex) =>
    Array.from({ length: OUTPUT_WIDTH }, (_, columnIndex) => {
      const idx = rowIndex * OUTPUT_WIDTH + columnIndex;
      const isBlack = frame.data[idx] === 0;
      return {
        rowIndex,
        columnIndex,
        color: isBlack ? BLACK : WHITE
      };
    })
  );

const layerDataToFrame = (data: PixelModifyItem[][], baseFrame: BinaryFrame): BinaryFrame => {
  const next = new Uint8ClampedArray(baseFrame.width * baseFrame.height).fill(255);
  data.forEach((row) => {
    row.forEach((item) => {
      if (item.rowIndex < 0 || item.rowIndex >= baseFrame.height) return;
      if (item.columnIndex < 0 || item.columnIndex >= baseFrame.width) return;
      const idx = item.rowIndex * baseFrame.width + item.columnIndex;
      const color = (item.color || WHITE).toLowerCase();
      const isBlack =
        color === BLACK || color === "#000" || color === "rgb(0,0,0)" || color === "black";
      next[idx] = isBlack ? 0 : 255;
    });
  });
  return { ...baseFrame, data: next, width: baseFrame.width, height: baseFrame.height };
};

type FrameThumbnailProps = {
  frame: BinaryFrame;
  index: number;
  isActive: boolean;
  onSelect: () => void;
};

const FrameThumbnail = ({ frame, index, isActive, onSelect }: FrameThumbnailProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(frame.width, frame.height);
    for (let i = 0; i < frame.data.length; i++) {
      const val = frame.data[i];
      const idx = i * 4;
      image.data[idx] = val;
      image.data[idx + 1] = val;
      image.data[idx + 2] = val;
      image.data[idx + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [frame]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-1 rounded border px-3 py-2 text-left shadow-sm transition ${
        isActive ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="badge badge-ghost badge-sm">Frame {index + 1}</span>
        {isActive && <span className="badge badge-primary badge-xs">editing</span>}
      </div>
      <canvas
        ref={canvasRef}
        width={frame.width}
        height={frame.height}
        className="w-24 h-auto rounded border border-dashed border-base-300 bg-white"
        style={{ imageRendering: "pixelated", aspectRatio: `${frame.width} / ${frame.height}` }}
      />
    </button>
  );
};

export default function PixelEditorPanel({ frames, fps, onChange }: Props) {
  const [activeId, setActiveId] = useState(frames[0]?.id ?? "");
  const [brushColor, setBrushColor] = useState<string>(WHITE);
  const [brushTool, setBrushTool] = useState<BrushTool>(BrushTool.DOT);
  const dottingRef = useRef<DottingRef>(null);
  const [dottingInstance, setDottingInstance] = useState<DottingRef | null>(null);
  const framesRef = useRef<BinaryFrame[]>(frames);
  const activeIdRef = useRef<string>(activeId);

  const activeFrame = useMemo(
    () => frames.find((frame) => frame.id === activeId) ?? frames[0] ?? createBlankFrame(),
    [activeId, frames]
  );

  const frameDuration = useMemo(() => {
    const currentFps = fps || speedToFps(8);
    return frames.length / currentFps;
  }, [frames.length, fps]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    framesRef.current = frames;
    if (!frames.length) {
      const blank = createBlankFrame();
      framesRef.current = [blank];
      onChange([blank]);
      setActiveId(blank.id);
    } else if (!frames.find((frame) => frame.id === activeId)) {
      setActiveId(frames[0].id);
    }
  }, [activeId, frames, onChange]);

  const handleDottingRef = useCallback((instance: DottingRef | null) => {
    dottingRef.current = instance;
    setDottingInstance(instance);
  }, []);

  const syncFrameToCanvas = useCallback(
    (frame: BinaryFrame | null) => {
      const instance = dottingRef.current;
      if (!instance || !frame) return;
      if (!(instance as any).interactionLayer) {
        requestAnimationFrame(() => syncFrameToCanvas(frame));
        return;
      }
      instance.setLayers([{ id: LAYER_ID, data: frameToLayerData(frame) }]);
      instance.setCurrentLayer?.(LAYER_ID);
      instance.changeBrushColor(brushColor);
      instance.changeBrushTool(brushTool);
    },
    [brushColor, brushTool]
  );

  useEffect(() => {
    syncFrameToCanvas(activeFrame);
  }, [activeFrame, dottingInstance, syncFrameToCanvas]);

  useEffect(() => {
    const instance = dottingRef.current;
    if (!instance) return;
    instance.changeBrushColor(brushColor);
    instance.changeBrushTool(brushTool);
  }, [brushColor, brushTool, dottingInstance]);

  const pushCanvasToFrames = useCallback(() => {
    const instance = dottingRef.current;
    if (!instance) return;
    const layers = instance.getLayersAsArray?.();
    const layer = layers?.find((item) => item.id === LAYER_ID) ?? layers?.[0];
    if (!layer) return;
    const currentFrames = framesRef.current;
    const currentActive = currentFrames.find((frame) => frame.id === activeIdRef.current);
    if (!currentActive) return;
    const nextFrame = layerDataToFrame(layer.data, currentActive);
    const nextFrames = currentFrames.map((frame) =>
      frame.id === currentActive.id ? nextFrame : frame
    );
    framesRef.current = nextFrames;
    onChange(nextFrames);
  }, [onChange]);

  const handleDataChange = useCallback(
    (params: CanvasDataChangeParams) => {
      if (!params.isLocalChange) return;
      pushCanvasToFrames();
    },
    [pushCanvasToFrames]
  );

  const handleStrokeEnd = useCallback(
    (_params: CanvasStrokeEndParams) => {
      pushCanvasToFrames();
    },
    [pushCanvasToFrames]
  );

  useEffect(() => {
    if (!dottingInstance) return;
    dottingInstance.addDataChangeListener(handleDataChange);
    dottingInstance.addStrokeEndListener(handleStrokeEnd);
    return () => {
      try {
        dottingInstance.removeDataChangeListener(handleDataChange);
      } catch {}
      try {
        dottingInstance.removeStrokeEndListener(handleStrokeEnd);
      } catch {}
    };
  }, [dottingInstance, handleDataChange, handleStrokeEnd]);

  const updateFrames = useCallback(
    (updater: (current: BinaryFrame[]) => BinaryFrame[], preferredActiveId?: string) => {
      const next = clampFrames(updater(framesRef.current));
      framesRef.current = next;
      onChange(next);

      let targetActiveId = preferredActiveId;
      if (targetActiveId && !next.some((frame) => frame.id === targetActiveId)) {
        targetActiveId = undefined;
      }
      if (!targetActiveId && next.some((frame) => frame.id === activeIdRef.current)) {
        targetActiveId = activeIdRef.current;
      }
      if (!targetActiveId && next.length) {
        targetActiveId = next[0].id;
      }

      if (targetActiveId && targetActiveId !== activeIdRef.current) {
        setActiveId(targetActiveId);
        activeIdRef.current = targetActiveId;
      }

      const freshActive = targetActiveId
        ? next.find((frame) => frame.id === targetActiveId)
        : null;
      if (freshActive) {
        syncFrameToCanvas(freshActive);
      }
    },
    [onChange, syncFrameToCanvas]
  );

  const addFrame = () => {
    const newFrame = createBlankFrame();
    updateFrames((current) => {
      if (MAX_FRAMES && current.length >= MAX_FRAMES) return current;
      return [...current, newFrame];
    }, newFrame.id);
  };

  const duplicateFrame = () => {
    const current = framesRef.current.find((frame) => frame.id === activeIdRef.current);
    if (!current) return;
    const newFrame = cloneFrame(current);
    updateFrames((existing) => {
      if (MAX_FRAMES && existing.length >= MAX_FRAMES) return existing;
      return [...existing, newFrame];
    }, newFrame.id);
  };

  const deleteFrame = () => {
    updateFrames((current) => {
      if (current.length <= 1) return current;
      const filtered = current.filter((frame) => frame.id !== activeIdRef.current);
      return filtered.length ? filtered : [createBlankFrame()];
    });
  };

  const moveFrame = (direction: -1 | 1) => {
    updateFrames((current) => {
      const index = current.findIndex((frame) => frame.id === activeIdRef.current);
      if (index === -1) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [removed] = next.splice(index, 1);
      next.splice(target, 0, removed);
      return next;
    });
  };

  const fillFrame = (value: 0 | 255) => {
    updateFrames((current) =>
      current.map((frame) =>
        frame.id === activeIdRef.current
          ? { ...frame, data: new Uint8ClampedArray(frame.data.length).fill(value) }
          : frame
      )
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className="badge badge-primary badge-sm">Pixel</span>
            <span className="badge badge-outline badge-sm">48×11 grid</span>
            <span className="badge badge-ghost badge-sm">
              {frames.length} frame{frames.length === 1 ? "" : "s"} ·{" "}
              {frameDuration.toFixed(2)}s @ {fps} fps
            </span>
          </div>
          <h3 className="text-xl font-bold">Pixel Animation Composer</h3>
          <p className="text-sm opacity-80">
            Draw directly on the badge grid and manage each frame in the strip below. The
            editor listens to Dotting events so brush strokes instantly update the active
            frame.
          </p>
        </div>
        <div className="join">
          <button
            className="btn btn-primary btn-sm join-item"
            onClick={addFrame}
            disabled={!!MAX_FRAMES && frames.length >= MAX_FRAMES}
          >
            Add frame
          </button>
          <button className="btn btn-outline btn-sm join-item" onClick={duplicateFrame}>
            Duplicate
          </button>
          <button
            className="btn btn-outline btn-sm join-item"
            onClick={deleteFrame}
            disabled={frames.length <= 1}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="join">
          <button
            className={`btn btn-sm join-item ${
              brushTool === BrushTool.DOT && brushColor === BLACK ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => {
              setBrushTool(BrushTool.DOT);
              setBrushColor(BLACK);
            }}
          >
            Draw black
          </button>
          <button
            className={`btn btn-sm join-item ${
              brushTool === BrushTool.DOT && brushColor === WHITE ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => {
              setBrushTool(BrushTool.DOT);
              setBrushColor(WHITE);
            }}
          >
            Draw white
          </button>
          <button
            className={`btn btn-sm join-item ${
              brushTool === BrushTool.PAINT_BUCKET ? "btn-primary" : "btn-outline"
            }`}
            onClick={() => {
              setBrushTool(BrushTool.PAINT_BUCKET);
            }}
          >
            Paint bucket
          </button>
        </div>
        <div className="join">
          <button className="btn btn-outline btn-sm join-item" onClick={() => moveFrame(-1)}>
            Move ←
          </button>
          <button className="btn btn-outline btn-sm join-item" onClick={() => moveFrame(1)}>
            Move →
          </button>
        </div>
        <div className="join">
          <button className="btn btn-outline btn-sm join-item" onClick={() => fillFrame(0)}>
            Fill black
          </button>
          <button className="btn btn-outline btn-sm join-item" onClick={() => fillFrame(255)}>
            Fill white
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-base-300 bg-base-200/60 overflow-hidden">
        {activeFrame ? (
          <div
            className="relative w-full"
            style={{ aspectRatio: `${OUTPUT_WIDTH} / ${OUTPUT_HEIGHT}` }}
          >
            <Dotting
              key={activeFrame.id}
              ref={handleDottingRef}
              width="100%"
              height="100%"
              style={{ width: "100%", height: "100%" }}
              initLayers={[
                {
                  id: LAYER_ID,
                  data: frameToLayerData(activeFrame)
                }
              ]}
              isGridFixed
              minRowCount={OUTPUT_HEIGHT}
              maxRowCount={OUTPUT_HEIGHT}
              minColumnCount={OUTPUT_WIDTH}
              maxColumnCount={OUTPUT_WIDTH}
              gridSquareLength={18}
              backgroundColor="#ffffff"
              defaultPixelColor="#ffffff"
              brushTool={brushTool}
              brushColor={brushColor}
              isPanZoomable
              isGridVisible
              isInteractionApplicable
              isDrawingEnabled
              initAutoScale
            />
          </div>
        ) : (
          <div className="alert alert-info">No frame selected.</div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Frame strip</h4>
          <span className="text-xs opacity-70">Max {MAX_FRAMES} frames</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {frames.map((frame, index) => (
            <FrameThumbnail
              key={frame.id}
              frame={frame}
              index={index}
              isActive={frame.id === activeId}
              onSelect={() => setActiveId(frame.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
