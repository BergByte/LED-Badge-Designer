import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { fileToFrames, FrameFile } from "@/utils/frameFile";

type ExampleEntry = {
  id: string;
  name: string;
  description: string;
  speed?: number;
  frameFile: FrameFile;
};

const EXAMPLES_ROOT = path.join(process.cwd(), "public", "examples");

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

const walkExamples = async (): Promise<Map<string, { ini?: string; json?: string }>> => {
  const pending: string[] = [EXAMPLES_ROOT];
  const seen = new Map<string, { ini?: string; json?: string }>();

  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== ".ini" && ext !== ".json") continue;
        const base = entry.name.slice(0, -ext.length);
        const relativeDir = path.relative(EXAMPLES_ROOT, current);
        const key = relativeDir ? path.join(relativeDir, base) : base;
        const bucket = seen.get(key) ?? {};
        if (ext === ".ini") bucket.ini = fullPath;
        if (ext === ".json") bucket.json = fullPath;
        seen.set(key, bucket);
      }
    }
  }

  return seen;
};

export async function GET() {
  try {
    const pairs = await walkExamples();
    const missing = Array.from(pairs.entries())
      .filter(([, paths]) => !(paths.ini && paths.json))
      .map(([base]) => base);
    if (missing.length) {
      throw new Error(`Example pairs missing .ini or .json: ${missing.join(", ")}`);
    }

    const examples: ExampleEntry[] = [];
    for (const [base, paths] of pairs.entries()) {
      if (!paths.ini || !paths.json) continue;
      const [iniText, jsonText] = await Promise.all([
        fs.readFile(paths.ini, "utf8"),
        fs.readFile(paths.json, "utf8")
      ]);
      const ini = parseIni(iniText);
      const frameFile = JSON.parse(jsonText) as FrameFile;
      // Validate frame file shape early
      fileToFrames(frameFile);
      examples.push({
        id: ini.id || base,
        name: ini.name || base,
        description: ini.description || "",
        speed: ini.speed ? Number(ini.speed) : frameFile.speed,
        frameFile
      });
    }

    return NextResponse.json({ examples });
  } catch (err) {
    console.error("Failed to load examples", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "Failed to load examples." },
      { status: 500 }
    );
  }
}
