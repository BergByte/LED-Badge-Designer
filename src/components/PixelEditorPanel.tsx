"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_FRAMES, OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/config/constants";
import { speedToFps } from "@/config/speeds";
import { BinaryFrame } from "@/types/frames";
import { cloneFrame, createBlankFrame } from "@/utils/frameUtils";

type Props = {
  frames: BinaryFrame[];
  fps: number;
  onChange: (frames: BinaryFrame[]) => void;
};

const clampFrames = (frames: BinaryFrame[]) =>
  frames.slice(0, MAX_FRAMES || frames.length);

const PixelCell = ({
  value,
  onToggle
}: {
  value: number;
  onToggle: () => void;
}) => (
  <button
    type="button"
    className={`w-4 h-4 border border-slate-200 ${
      value === 0 ? "bg-slate-900" : "bg-white"
    }`}
    onClick={onToggle}
  />
);

const FrameGrid = ({
  frame,
  onUpdate
}: {
  frame: BinaryFrame;
  onUpdate: (data: Uint8ClampedArray) => void;
}) => {
  const handleToggle = (index: number) => {
    const next = new Uint8ClampedArray(frame.data);
    next[index] = next[index] === 0 ? 255 : 0;
    onUpdate(next);
  };

  const cells = [];
  for (let y = 0; y < OUTPUT_HEIGHT; y++) {
    for (let x = 0; x < OUTPUT_WIDTH; x++) {
      const idx = y * OUTPUT_WIDTH + x;
      cells.push(
        <PixelCell key={`${x}-${y}`} value={frame.data[idx]} onToggle={() => handleToggle(idx)} />
      );
    }
  }

  return (
    <div
      className="grid gap-0"
      style={{
        gridTemplateColumns: `repeat(${OUTPUT_WIDTH}, 1fr)`
      }}
    >
      {cells}
    </div>
  );
};

export default function PixelEditorPanel({ frames, fps, onChange }: Props) {
  const [activeId, setActiveId] = useState(frames[0]?.id ?? "");
  const activeFrame =
    frames.find((frame) => frame.id === activeId) ?? frames[0] ?? createBlankFrame();

  useEffect(() => {
    if (!frames.find((f) => f.id === activeId) && frames.length) {
      setActiveId(frames[0].id);
    }
  }, [activeId, frames]);

  const frameDuration = useMemo(() => {
    const currentFps = fps || speedToFps(8);
    return frames.length / currentFps;
  }, [frames.length, fps]);

  const updateFrame = (frameId: string, data: Uint8ClampedArray) => {
    const next = frames.map((frame) =>
      frame.id === frameId ? { ...frame, data } : frame
    );
    onChange(next);
  };

  const addFrame = () => {
    if (MAX_FRAMES && frames.length >= MAX_FRAMES) return;
    onChange(clampFrames([...frames, createBlankFrame()]));
  };

  const duplicateFrame = () => {
    if (!activeFrame) return;
    if (MAX_FRAMES && frames.length >= MAX_FRAMES) return;
    onChange(clampFrames([...frames, cloneFrame(activeFrame)]));
  };

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Pixel Animation Editor</h3>
          <p className="text-sm text-slate-600">
            48×11 canvas with timeline controls. Frames: {frames.length} · Duration:{" "}
            {frameDuration.toFixed(2)}s @ {fps} fps
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded bg-slate-900 text-white"
            onClick={addFrame}
            disabled={!!MAX_FRAMES && frames.length >= MAX_FRAMES}
          >
            Add frame
          </button>
          <button className="px-3 py-2 rounded bg-slate-100" onClick={duplicateFrame}>
            Duplicate
          </button>
          <button
            className="px-3 py-2 rounded bg-slate-100"
            onClick={deleteFrame}
            disabled={frames.length <= 1}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex gap-3 text-sm">
        <button
          className="px-3 py-2 rounded border border-slate-200"
          onClick={() => moveFrame(-1)}
        >
          Move ←
        </button>
        <button
          className="px-3 py-2 rounded border border-slate-200"
          onClick={() => moveFrame(1)}
        >
          Move →
        </button>
        <button
          className="px-3 py-2 rounded border border-slate-200"
          onClick={clearFrame}
        >
          Clear
        </button>
        <button
          className="px-3 py-2 rounded border border-slate-200"
          onClick={() => fillFrame(0)}
        >
          Fill black
        </button>
        <button
          className="px-3 py-2 rounded border border-slate-200"
          onClick={() => fillFrame(255)}
        >
          Fill white
        </button>
      </div>

      <div className="border border-slate-200 rounded p-3 bg-slate-50 overflow-auto">
        {activeFrame ? (
          <FrameGrid
            frame={activeFrame}
            onUpdate={(data) => updateFrame(activeFrame.id, data)}
          />
        ) : (
          <div className="text-sm text-slate-600">No frame selected.</div>
        )}
      </div>

      <div className="flex gap-2 overflow-auto">
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            onClick={() => setActiveId(frame.id)}
            className={`flex flex-col items-center px-2 py-2 border rounded ${
              frame.id === activeId
                ? "border-emerald-500 bg-emerald-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <span className="text-xs text-slate-600">Frame {index + 1}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Timeline caps at {MAX_FRAMES} frames (configurable). Add, duplicate, reorder, and
        clear frames before rendering/exporting.
      </p>
    </div>
  );
}
