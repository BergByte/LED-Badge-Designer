import { BinaryFrame } from "@/types/frames";
import { cloneFrame } from "@/utils/frameUtils";
import { fileToFrames, FrameFile } from "@/utils/frameFile";

export type ExampleAnimation = {
  id: string;
  title: string;
  description: string;
  speed?: number;
  frames: BinaryFrame[];
};

type ExampleManifestEntry = {
  id: string;
  name: string;
  description: string;
  speed?: number;
  frameFile: FrameFile;
};

export const loadExamplesFromPublic = async (): Promise<ExampleAnimation[]> => {
  try {
    const response = await fetch("/api/examples");
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Unable to load examples.");
    }
    const { examples } = (await response.json()) as { examples: ExampleManifestEntry[] };
    if (!Array.isArray(examples)) return [];
    return examples
      .map((entry) => {
        try {
          const parsed = fileToFrames(entry.frameFile);
          return {
            id: entry.id,
            title: entry.name || entry.id,
            description: entry.description || "",
            speed: entry.speed ?? parsed.speed,
            frames: parsed.frames.map((frame) => cloneFrame(frame))
          } satisfies ExampleAnimation;
        } catch (err) {
          console.warn(`Skipping example ${entry.id}:`, err);
          return null;
        }
      })
      .filter(Boolean) as ExampleAnimation[];
  } catch (err) {
    console.warn("Unable to load examples:", err);
    return [];
  }
};
