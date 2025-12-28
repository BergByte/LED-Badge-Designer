export type SpeedSetting = {
  speed: number;
  fps: number;
};

export const SPEEDS: SpeedSetting[] = [
  { speed: 8, fps: 15 },
  { speed: 7, fps: 7.5 },
  { speed: 6, fps: 4.5 },
  { speed: 5, fps: 2.8 },
  { speed: 4, fps: 2.4 },
  { speed: 3, fps: 2.0 },
  { speed: 2, fps: 1.3 },
  { speed: 1, fps: 1.2 }
];

export const speedToFps = (speed: number) =>
  SPEEDS.find((entry) => entry.speed === speed)?.fps ?? SPEEDS[0].fps;
