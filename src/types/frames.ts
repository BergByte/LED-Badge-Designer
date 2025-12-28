export type BinaryFrame = {
  id: string;
  data: Uint8ClampedArray; // length = width * height, values 0 or 255
  width: number;
  height: number;
};

export type RenderedSprite = {
  blob: Blob;
  frameCount: number;
  width: number;
  height: number;
};
