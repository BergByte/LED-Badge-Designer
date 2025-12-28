import { BinaryFrame } from "@/types/frames";
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/config/constants";

export const createBlankFrame = (): BinaryFrame => ({
  id: crypto.randomUUID(),
  width: OUTPUT_WIDTH,
  height: OUTPUT_HEIGHT,
  data: new Uint8ClampedArray(OUTPUT_WIDTH * OUTPUT_HEIGHT)
});

export const cloneFrame = (frame: BinaryFrame): BinaryFrame => ({
  id: crypto.randomUUID(),
  width: frame.width,
  height: frame.height,
  data: new Uint8ClampedArray(frame.data)
});
