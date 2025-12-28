"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_FRAMES, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/config/constants";
import { speedToFps } from "@/config/speeds";
import { BinaryFrame } from "@/types/frames";
import { cloneFrame, createBlankFrame } from "@/utils/frameUtils";
import { BrushTool, Dotting, DottingRef, PixelModifyItem } from "dotting";

type Props = {
  frames: BinaryFrame[];
  fps: number;
  onChange: (frames: BinaryFrame[]) => void;
};

const clampFrames = (frames: BinaryFrame[]) =>
  frames.slice(0, MAX_FRAMES || frames.length);

export default function PixelEditorPanel({ frames, fps, onChange }: Props) {
  const [activeId, setActiveId] = useState(frames[0]?.id ?? "");
  const [brushColor, setBrushColor] = useState<string>("#000000");
  const [dottingKey, setDottingKey] = useState(0);
  const dottingRef = useRef<DottingRef>(null);
  const framesRef = useRef<BinaryFrame[]>(frames);
  const activeFrame =
    frames.find((frame) => frame.id === activeId) ?? frames[0] ?? createBlankFrame();

  useEffect(() => {
    if (!frames.find((f) => f.id === activeId) && frames.length) {
      setActiveId(frames[0].id);
    }
  }, [activeId, frames]);

  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  const frameDuration = useMemo(() => {
    const currentFps = fps || speedToFps(8);
    return frames.length / currentFps;
  }, [frames.length, fps]);

  useEffect(() => {
    setDottingKey((prev) => prev + 1);
  }, [activeFrame]);
  const normalizeColor = (color: string) => {
    const clean = color.trim().toLowerCase();
    if (clean === "#000" || clean === "#000000" || clean === "black" || clean === "rgb(0,0,0)") {
      return "#000000";
    }
    return "#ffffff";
  };

  const frameToLayerData = (frame: BinaryFrame): PixelModifyItem[][] => {
    const rows: PixelModifyItem[][] = [];
    for (let rowIndex = 0; rowIndex < OUTPUT_HEIGHT; rowIndex++) {
      const row: PixelModifyItem[] = [];
      for (let columnIndex = 0; columnIndex < OUTPUT_WIDTH; columnIndex++) {
        const idx = rowIndex * OUTPUT_WIDTH + columnIndex;
        const isBlack = frame.data[idx] === 0;
        row.push({
          rowIndex,
          columnIndex,
          color: isBlack ? "#000000" : "#ffffff"
        });
      }
      rows.push(row);
    }
    return rows;
  };

  const layerDataToFrame = (
    data: PixelModifyItem[][],
    baseFrame: BinaryFrame
  ): BinaryFrame => {
    const next = new Uint8ClampedArray(baseFrame.data.length).fill(255);
    data.forEach((row) => {
      row.forEach((item) => {
        if (
          item.rowIndex >= 0 &&
          item.rowIndex < OUTPUT_HEIGHT &&
          item.columnIndex >= 0 &&
          item.columnIndex < OUTPUT_WIDTH
        ) {
          const idx = item.rowIndex * OUTPUT_WIDTH + item.columnIndex;
          const color = normalizeColor(item.color);
          next[idx] = color === "#000000" ? 0 : 255;
        }
      });
    });
    return { ...baseFrame, data: next, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT };
  };

  const activeLayerData = useMemo(() => frameToLayerData(activeFrame), [activeFrame]);

  const addFrame = () => {
    if (MAX_FRAMES && frames.length >= MAX_FRAMES) return;
    onChange(clampFrames([...frames, createBlankFrame()]));
  };

  const duplicateFrame = () => {
    if (!activeFrame) return;
    if (MAX_FRAMES && frames.length >= MAX_FRAMES) return;
    onChange(clampFrames([...frames, cloneFrame(activeFrame)]));
  };

  useEffect(() => {
    if (!dottingRef.current) return;
    dottingRef.current.changeBrushTool(BrushTool.DOT);
    dottingRef.current.changeBrushColor(brushColor);
  }, [brushColor]);

  const deleteFrame = () => {
    if (frames.length <= 1) return;
    const next = frames.filter((frame) => frame.id !== activeId);
    onChange(next);
    setActiveId(next[0].id);
  };

  const moveFrame = (direction: -1 | 1) => {
    const index = frames.findIndex((frame) => frame.id === activeId);
    if (index === -1) return;
    const target = index + direction;
    if (target < 0 || target >= frames.length) return;
    const next = [...frames];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    onChange(next);
  };

  const clearFrame = () => {
    if (!activeFrame) return;
    onChange(
      frames.map((frame) =>
        frame.id === activeId
          ? { ...frame, data: new Uint8ClampedArray(frame.data.length) }
          : frame
      )
    );
  };

  const fillFrame = (value: 0 | 255) => {
    if (!activeFrame) return;
    const filled = new Uint8ClampedArray(activeFrame.data.length).fill(value);
    onChange(
      frames.map((frame) =>
        frame.id === activeId ? { ...frame, data: filled } : frame
      )
    );
  };

  useEffect(() => {
    const ref = dottingRef.current;
    if (!ref || !activeFrame || !ref.addDataChangeListener) return;
    const instance = ref;

    const pushFrameUpdate = () => {
      const layers = ref.getLayersAsArray?.();
      const layer = layers?.[0];
      if (!layer) return;
      const currentFrames = framesRef.current;
      const baseFrame =
        currentFrames.find((frame) => frame.id === activeFrame.id) ?? activeFrame;
      const nextFrame = layerDataToFrame(layer.data, baseFrame);
      const nextFrames = currentFrames.map((frame) =>
        frame.id === activeFrame.id ? nextFrame : frame
      );
      onChange(nextFrames);
    };

    instance.addDataChangeListener?.(pushFrameUpdate);
    instance.addStrokeEndListener?.(pushFrameUpdate);
    return () => {
    try {
           instance?.removeDataChangeListener?.(pushFrameUpdate);
          } catch {
            // ignore teardown errors when dotting has already disposed internals
          }
          try {
            instance?.removeStrokeEndListener?.(pushFrameUpdate);
          } catch {
           // ignore teardown errors when dotting has already disposed internals
         }
      };

  }, [activeFrame, onChange]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Pixel Animation Editor</h3>
          <p className="text-sm opacity-70">
            48×11 grid with timeline controls. Frames: {frames.length} · Duration:{" "}
            {frameDuration.toFixed(2)}s @ {fps} fps
          </p>
        </div>
        <div className="join">
          <button
            className="btn btn-primary btn-sm join-item"
            onClick={addFrame}
            disabled={!!MAX_FRAMES && frames.length >= MAX_FRAMES}
          >
            Add
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

      <div className="flex flex-wrap gap-2 text-sm">
        <button className="btn btn-outline btn-sm" onClick={() => moveFrame(-1)}>
          Move ←
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => moveFrame(1)}>
          Move →
        </button>
        <button className="btn btn-outline btn-sm" onClick={clearFrame}>
          Clear
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => fillFrame(0)}>
          Fill black
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => fillFrame(255)}>
          Fill white
        </button>
        <div className="join">
          <button
            className={`btn btn-sm join-item ${brushColor === "#000000" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setBrushColor("#000000")}
          >
            Brush: Black
          </button>
          <button
            className={`btn btn-sm join-item ${brushColor === "#ffffff" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setBrushColor("#ffffff")}
          >
            Brush: White
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-base-300 bg-base-200/60 p-3 overflow-auto">
        {activeFrame ? (
          <Dotting
            key={dottingKey}
            ref={dottingRef}
            width="100%"
            height={360}
            style={{ minHeight: 260 }}
            initLayers={[
              {
                id: "layer-1",
                data: activeLayerData
              }
            ]}
            isGridFixed
            minRowCount={OUTPUT_HEIGHT}
            maxRowCount={OUTPUT_HEIGHT}
            minColumnCount={OUTPUT_WIDTH}
            maxColumnCount={OUTPUT_WIDTH}
            gridSquareLength={16}
            backgroundColor="#ffffff"
            defaultPixelColor="#ffffff"
            brushTool={BrushTool.DOT}
            brushColor={brushColor}
            isPanZoomable
            isGridVisible
            isInteractionApplicable
            isDrawingEnabled
            initAutoScale
          />
        ) : (
          <div className="alert alert-info">No frame selected.</div>
        )}
      </div>

      <div className="flex gap-2 overflow-auto pb-1">
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            onClick={() => setActiveId(frame.id)}
            className={`btn btn-xs ${
              frame.id === activeId ? "btn-primary" : "btn-outline"
            }`}
          >
            Frame {index + 1}
          </button>
        ))}
      </div>
      <p className="text-xs opacity-70">
        Timeline caps at {MAX_FRAMES} frames (configurable). Add, duplicate, reorder, and
        clear frames before rendering/exporting.
      </p>
    </div>
  );
}
