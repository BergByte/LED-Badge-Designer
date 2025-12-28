# LED Badge Studio

Browser-based 48x11 LED name badge builder. Convert a video or GIF, draw pixel art frame-by-frame, preview at badge speed, then download a single-row sprite PNG ready for the Winbond 0416:5020 badge upload script.

> Heads up: this project was spun up by an AI—expect.

## Quick start
- Install deps: `pnpm install`
- Run dev server: `pnpm dev` (Next.js with hot reload)
- Build for production: `pnpm build`

## How to use
- **Video/GIF → badge:** Upload a clip, set trim in/out, crop to the 48x11 aspect, and render frames at the selected speed.
- **Pixel animation → badge:** Draw monochrome frames with the dot/line/rectangle tools, duplicate or add frames, and set playback speed.
- **Preview:** Live canvas preview runs at the chosen speed (speed presets map to FPS).
- **Export:** Click Render to generate the sprite PNG, then Download to save it.
- **Upload to the badge:** Use the python utility with your chosen speed:
  ```
  python3 lednamebadge.py -m 5 -s <speed> :/path/to/downloaded/sprite.png:
  ```

## Stack
- Next.js 16, React 19, TypeScript
- Tailwind CSS with DaisyUI
- `react-easy-crop` for video/GIF cropping
- `dotting` for pixel editing and brush tools
- CLI Tool for communication https://github.com/jnweiger/led-name-badge-ls32
- Alternative firmware for the badge https://github.com/fossasia/badgemagic-firmware