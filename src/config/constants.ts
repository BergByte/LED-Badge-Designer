export const OUTPUT_WIDTH = 48;
export const OUTPUT_HEIGHT = 11;
export const OUTPUT_ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;

export const DEFAULT_SPEED = 8;
export const MAX_VIDEO_FRAMES = 80; // cap video-derived sprites to keep badge payloads small
export const MAX_FRAMES = 120; // optional cap to avoid huge sprites

export const BADGE_DEVICE = {
  usbVendorId: 0x0416,
  usbProductId: 0x5020
};
