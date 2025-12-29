import { BinaryFrame } from "@/types/frames";
import { cloneFrame } from "@/utils/frameUtils";
import { parseFrameFile } from "@/utils/frameFile";

export type ExampleAnimation = {
  id: string;
  title: string;
  description: string;
  speed?: number;
  frames: BinaryFrame[];
};

type ExampleManifestEntry = {
  id: string;
  ini: string;
  frames: string;
};

const parseIni = (text: string): Record<string, string> => {
  const result: Record<string, string> = {};
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line || line.startsWith(";") || line.startsWith("#") || line.startsWith("[")) return;
      const [key, ...rest] = line.split("=");
      if (!key) return;
      result[key.trim()] = rest.join("=").trim();
    });
  return result;
};

const fetchText = async (path: string) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Unable to load ${path}`);
  }
  return response.text();
};

const loadExample = async (entry: ExampleManifestEntry): Promise<ExampleAnimation | null> => {
  try {
    const [iniText, framesText] = await Promise.all([
      fetchText(`/${entry.ini}`),
      fetchText(`/${entry.frames}`)
    ]);
    const ini = parseIni(iniText);
    const parsed = parseFrameFile(framesText);
    if (!parsed.frames.length) return null;
    const speed = ini.speed ? Number(ini.speed) : parsed.speed;
    return {
      id: entry.id,
      title: ini.name || entry.id,
      description: ini.description || "",
      speed: Number.isFinite(speed) ? speed : undefined,
      frames: parsed.frames.map((frame) => cloneFrame(frame))
    };
  } catch (err) {
    console.warn(`Skipping example ${entry.id}:`, err);
    return null;
  }
};

export const loadExamplesFromPublic = async (): Promise<ExampleAnimation[]> => {
  try {
    const response = await fetch("/examples/index.json");
    if (!response.ok) {
      throw new Error("Unable to load example list.");
    }
    const manifest = (await response.json()) as ExampleManifestEntry[];
    if (!Array.isArray(manifest)) return [];
    const loaded = await Promise.all(manifest.map((entry) => loadExample(entry)));
    return loaded.filter(Boolean) as ExampleAnimation[];
  } catch (err) {
    console.warn("Unable to load examples:", err);
    return [];
  }
};
