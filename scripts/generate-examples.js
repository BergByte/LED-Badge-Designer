#!/usr/bin/env node
/**
 * Generate example animations into public/examples/*.
 * Usage: node scripts/generate-examples.js
 */
const fs = require("fs");
const path = require("path");

const OUTPUT_WIDTH = 48;
const OUTPUT_HEIGHT = 11;

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const createBlankFrame = () => ({
  width: OUTPUT_WIDTH,
  height: OUTPUT_HEIGHT,
  data: new Uint8ClampedArray(OUTPUT_WIDTH * OUTPUT_HEIGHT).fill(0)
});

const cloneFrame = (frame) => ({
  width: frame.width,
  height: frame.height,
  data: new Uint8ClampedArray(frame.data)
});

const setPixel = (frame, row, col, isBlack) => {
  if (row < 0 || row >= frame.height) return;
  if (col < 0 || col >= frame.width) return;
  frame.data[row * frame.width + col] = isBlack ? 0 : 255;
};

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");

const packFrameData = (frame) => {
  const totalPixels = frame.width * frame.height;
  const byteLength = Math.ceil(totalPixels / 8);
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < totalPixels; i++) {
    const byteIndex = i >> 3;
    const bitIndex = i & 7;
    const isBlack = frame.data[i] === 0;
    if (isBlack) {
      bytes[byteIndex] |= 1 << bitIndex;
    }
  }
  return toBase64(bytes);
};

const framesToFile = (frames, speed) => ({
  version: 1,
  width: frames[0].width,
  height: frames[0].height,
  speed,
  frames: frames.map((frame) => ({ data: packFrameData(frame) })),
  meta: { createdAt: new Date().toISOString() }
});

const buildScanner = () => {
  const barWidth = 6;
  const positions = [];
  for (let pos = 0; pos <= OUTPUT_WIDTH - barWidth; pos++) positions.push(pos);
  for (let pos = OUTPUT_WIDTH - barWidth - 1; pos >= 1; pos--) positions.push(pos);
  const frames = positions.map((pos) => {
    const frame = createBlankFrame();
    const row = Math.floor(frame.height / 2);
    for (let c = pos; c < pos + barWidth; c++) {
      setPixel(frame, row, c, true);
    }
    return frame;
  });
  return { id: "scanner", name: "Scanner Bar", description: "A KITT-style bar sweeping left and right.", speed: 10, frames };
};

const buildWave = () => {
  const frameCount = 24;
  const amplitude = OUTPUT_HEIGHT / 2 - 1;
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const frame = createBlankFrame();
    const phase = (f / frameCount) * Math.PI * 2;
    for (let x = 0; x < OUTPUT_WIDTH; x++) {
      const radians = (x / OUTPUT_WIDTH) * Math.PI * 2 + phase;
      const y = Math.round(amplitude + amplitude * Math.sin(radians));
      setPixel(frame, y, x, true);
    }
    frames.push(frame);
  }
  return { id: "wave", name: "Sine Wave", description: "Smooth sine wave gliding across the badge.", speed: 8, frames };
};

const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const buildSparkle = () => {
  const frameCount = 30;
  const rng = mulberry32(0xabad1dea);
  const frames = [];
  for (let f = 0; f < frameCount; f++) {
    const frame = createBlankFrame();
    const sparkles = 20;
    for (let i = 0; i < sparkles; i++) {
      const col = Math.floor(rng() * OUTPUT_WIDTH);
      const row = Math.floor(rng() * OUTPUT_HEIGHT);
      setPixel(frame, row, col, true);
      if (rng() > 0.6) {
        setPixel(frame, row, (col + 1) % OUTPUT_WIDTH, true);
      }
    }
    frames.push(frame);
  }
  return { id: "sparkle", name: "Sparkle", description: "Random sparkle shimmer across the grid.", speed: 6, frames };
};

const EXAMPLE_BUILDERS = [buildScanner, buildWave, buildSparkle];

const writeIni = (dest, example) => {
  const lines = [
    "[meta]",
    `id=${example.id}`,
    `name=${example.name}`,
    `description=${example.description}`,
    `speed=${example.speed ?? ""}`
  ];
  fs.writeFileSync(dest, lines.join("\n"), "utf8");
};

const main = () => {
  const root = path.join(process.cwd(), "public", "examples");
  ensureDir(root);
  const manifest = [];

  EXAMPLE_BUILDERS.forEach((builder) => {
    const example = builder();
    const dir = path.join(root, example.id);
    ensureDir(dir);
    const framesFile = framesToFile(example.frames.map((f) => cloneFrame(f)), example.speed);
    fs.writeFileSync(path.join(dir, "frames.json"), JSON.stringify(framesFile, null, 2));
    writeIni(path.join(dir, "metadata.ini"), example);
    manifest.push({
      id: example.id,
      ini: `examples/${example.id}/metadata.ini`,
      frames: `examples/${example.id}/frames.json`
    });
  });

  fs.writeFileSync(path.join(root, "index.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} examples to ${root}`);
};

main();
