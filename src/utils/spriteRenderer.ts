import { BinaryFrame, RenderedSprite } from "@/types/frames";
import { OUTPUT_HEIGHT, OUTPUT_WIDTH } from "@/config/constants";

const expandToRgba = (data: Uint8ClampedArray): Uint8ClampedArray => {
  const rgba = new Uint8ClampedArray(data.length * 4);
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    const idx = i * 4;
    rgba[idx] = value;
    rgba[idx + 1] = value;
    rgba[idx + 2] = value;
    rgba[idx + 3] = 255;
  }
  return rgba;
};

export async function renderFramesToSpritePNG(
  frames: BinaryFrame[]
): Promise<RenderedSprite> {
  if (!frames.length) {
    throw new Error("No frames to render");
  }

  const frameCount = frames.length;
  const width = OUTPUT_WIDTH * frameCount;

  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, OUTPUT_HEIGHT)
      : (() => {
          const fallback = document.createElement("canvas");
          fallback.width = width;
          fallback.height = OUTPUT_HEIGHT;
          return fallback;
        })();

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create canvas context");
  }

  frames.forEach((frame, index) => {
    const imageData = new ImageData(
      expandToRgba(frame.data),
      frame.width,
      frame.height
    );
    ctx.putImageData(imageData, index * OUTPUT_WIDTH, 0);
  });

  const blob =
    "convertToBlob" in canvas
      ? await (canvas as OffscreenCanvas).convertToBlob({ type: "image/png" })
      : await new Promise<Blob>((resolve) => {
          (canvas as HTMLCanvasElement).toBlob((b) => {
            resolve(b as Blob);
          }, "image/png");
        });

  return {
    blob,
    frameCount,
    width,
    height: OUTPUT_HEIGHT
  };
}
