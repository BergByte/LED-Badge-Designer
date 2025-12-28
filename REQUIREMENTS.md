# Requirements — 48×11 LED Badge Studio (Next.js, Client-Only)

## 1) Purpose

Build a **client-only** web app (no login, no backend) that lets a user:

1. **Trim a custom video** to a predefined max duration and convert it into a **48×11** monochrome-inverted sprite row (frames laid out horizontally).
2. **Create a pixel-art animation** (48×11) with a **frame timeline editor**, then render it into the same sprite-row format.
3. **Preview** the output in the browser using a pipeline equivalent to the provided `ffmpeg` filter graph.
4. **Download** the rendered sprite PNG (single row).
5. **Transmit** the sprite to a **48×11 LED badge** device via **WebHID or WebUSB**.

The app must run on **GitHub Pages**.

---

## 2) Technical Constraints & Fixed Parameters

### 2.1 Output format

* Output resolution: **48×11 pixels**
* Aspect ratio: **48:11** (≈ 4.3636:1)
* Output: **PNG** containing **one row** of frames (sprite sheet), frames aligned **left-to-right**.
* Color: **inverted black/white** (binary threshold at 128, invert: `>=128 → 0`, else `255`).

### 2.2 Supported framerates (user selectable)

User chooses a “Speed” which maps to FPS:

| Speed |  FPS |
| ----: | :--: |
|     8 | 15.0 |
|     7 |  7.5 |
|     6 |  4.5 |
|     5 |  2.8 |
|     4 |  2.4 |
|     3 |  2.0 |
|     2 |  1.3 |
|     1 |  1.2 |

### 2.3 Video constraints

* Video feature supports **trim only** (no crop UI timeline cutting beyond selecting start/end).
* **Max duration** is predefined (config constant).
* **Aspect ratio** of the effective processed region must match **48:11**.
* If the user video doesn’t match, the app must either:

  * **auto center-crop** to 48:11, or
  * **letterbox/pillarbox** (must be decided and implemented consistently; default recommendation: **center-crop** to preserve fill).

### 2.4 Pixel-art animation constraints

* Canvas size: **48×11** fixed.
* Animation length:

  * Frame timeline length is predefined (config constant) **or**
  * Derived from duration and FPS (if duration is fixed).
* Timeline is required (frame list with add/duplicate/delete/reorder, onion skin optional).

### 2.5 Runtime constraints

* **Everything runs in the user’s browser**
* **ffmpeg should run client-side if possible** (requirement: implement client-side rendering; allow a fallback only if the browser cannot run it).
* Must be deployable to **GitHub Pages** (static hosting).

### 2.6 Target device

* LED badge: **48×11 px**
* USB listing given: `Bus 001 Device 003: ID 0416:5020 Winbond Electronics Corp. CH583`
* The app must support transmission via:

  * **WebHID** (preferred when device exposes HID interface)
  * **WebUSB** (fallback when HID is unavailable but USB is accessible)

> Note: Device *protocol* (report format / endpoints / commands) is not specified. Requirements include defining it (reverse-engineer or vendor docs) and implementing it once known.

---

## 3) Deployment Requirements (GitHub Pages)

### 3.1 Next.js setup

* Use Next.js with static export:

  * `output: 'export'`
  * Ensure all routes used are compatible with static export (no server actions required).
* Asset paths must work on a subpath (GitHub Pages project page):

  * Configure `basePath` and `assetPrefix` using repository name.
* Use a GitHub Actions workflow to build and deploy to Pages.

### 3.2 No server dependencies

* No API routes.
* No server-side rendering requirements.
* All processing is done in browser with WebAssembly / Canvas / Web APIs.

---

## 4) Homepage Information Architecture

Homepage contains two primary tabs/modes and a shared output area:

1. **Video → Badge**
2. **Pixel Animation → Badge**
3. Shared: **Speed (FPS) selector**, **Preview**, **Render**, **Download**, **Send to Badge**

Required layout sections:

* Header: App name + brief purpose.
* Main mode switch: Tabs or segmented control.
* Mode-specific editor panel (video trim OR pixel timeline editor).
* Output panel:

  * Preview player (animated)
  * Sprite preview (image)
  * Download button
  * Device connect/send controls
* Footer: Supported browsers note, privacy note (“runs locally”), build info.

---

## 5) User Flows

### 5.1 Video flow

1. User opens “Video → Badge”.
2. User uploads a video file (`.mp4`, `.mov`, `.webm` as supported).
3. User selects trim start and end within max duration.
4. User selects Speed (FPS).
5. User clicks **Preview** → sees 48×11 thresholded/inverted output animation.
6. User clicks **Render Sprite** → generates a single-row PNG sprite.
7. User can **Download** PNG.
8. User clicks **Connect Badge** → chooses device.
9. User clicks **Send to Badge** → sprite is transmitted.

### 5.2 Pixel animation flow

1. User opens “Pixel Animation → Badge”.
2. User draws frames on a 48×11 editor.
3. User manages frames in timeline (add/duplicate/delete/reorder).
4. User selects Speed (FPS).
5. User clicks **Preview** → plays frames at selected FPS.
6. User clicks **Render Sprite** → generates single-row PNG sprite.
7. Download and Send same as video flow.

---

## 6) Functional Requirements

## 6.1 Global configuration

* The following are compile-time or runtime constants (editable in a single config file):

  * `OUTPUT_WIDTH = 48`
  * `OUTPUT_HEIGHT = 11`
  * `OUTPUT_ASPECT = 48 / 11`
  * `MAX_VIDEO_DURATION_SECONDS` (predefined)
  * `MAX_FRAMES` (optional cap to avoid huge sprites)
  * `DEFAULT_SPEED` (e.g., Speed 8)
* The app must prevent rendering when constraints are exceeded and show an actionable error.

---

## 6.2 FPS / Speed selector

* Provide a dropdown or radio group labeled “Speed”.
* Display both “Speed N” and FPS value.
* Changing speed must update:

  * Preview playback speed
  * Frame extraction FPS for video rendering
  * Exported sprite

---

## 6.3 Video feature (Trim-only + aspect handling)

### 6.3.1 Upload

* Accept local video file input.
* Show metadata after load:

  * duration
  * resolution
  * codec/container if available (optional)
* If duration < required minimum (if any), still allow render unless explicitly forbidden.

### 6.3.2 Trim UI

* Provide a timeline scrubber with two handles: `START_TIME` and `END_TIME`.
* Enforce:

  * `0 ≤ START_TIME < END_TIME ≤ videoDuration`
  * `(END_TIME - START_TIME) ≤ MAX_VIDEO_DURATION_SECONDS`
* Show selected duration and estimated frames: `ceil(duration * FPS)`.

### 6.3.3 Aspect ratio and resizing policy

* Output must be exactly 48×11.
* Implement **one** consistent policy (required to document and expose in UI as help text):

  * **Policy A (recommended): center-crop to 48:11**, then scale down to 48×11 using nearest-neighbor.
  * If user video is too narrow/tall, crop accordingly; if too wide, crop sides.
* The app must never distort aspect ratio.

---

## 6.4 Pixel Animation feature (Dotting + timeline)

### 6.4.1 Canvas editor

* Use `dotting` for pixel editing.
* Fixed grid size: 48×11.
* Tools required:

  * pen
  * eraser
  * fill (optional but recommended)
  * clear frame
  * undo/redo (at least per-frame)

### 6.4.2 Frame timeline

* Provide a horizontal timeline strip of thumbnails.
* Required operations:

  * Add frame (blank)
  * Duplicate frame
  * Delete frame (with safeguard if only 1 frame)
  * Reorder via drag-and-drop
  * Select active frame
* Display total frame count and computed duration at chosen FPS:

  * `durationSeconds = frames / FPS`

### 6.4.3 Frame constraints

* Timeline length/time is predefined via config **or** fixed max frames:

  * If max duration is the constraint: `maxFrames = floor(MAX_ANIM_DURATION_SECONDS * FPS)`
  * If fixed frames is the constraint: enforce `frames ≤ MAX_FRAMES`
* UI must prevent exceeding the limit.

---

## 6.5 Preview (for both features)

### 6.5.1 Preview output requirements

Preview must display what the badge will show:

* resolution: 48×11
* monochrome, inverted threshold
* fps according to selected speed

### 6.5.2 Preview pipeline equivalence

The preview rendering must be equivalent to this filter logic:

* Seek to trim start: `-ss START_TIME`
* Scale to width 48 with nearest neighbor: `scale=48:-1:flags=neighbor`
* Convert to grayscale: `format=gray`
* Invert binary threshold: `lut=y='if(gte(val,128),0,255)'`
* Crop to height 11 centered vertically: `crop=in_w:11:0:(in_h-11)/2`
* Set fps: `fps=FPS`
* Tile horizontally to a single-row sprite when exporting: `tile=FRAMES_PER_FILEx1:margin=0:padding=0`

**Preview** may render as an animated `<canvas>` playback (frame-by-frame) rather than a `<video>`.

### 6.5.3 Performance and responsiveness

* Preview should begin within a reasonable time for small clips (target: a few seconds).
* Show progress indicators for frame extraction and render steps.
* Provide a “Cancel” action to stop rendering.

---

## 6.6 Rendering / Sprite PNG generation

### 6.6.1 Output sprite requirements

* Generate **one PNG** where:

  * frame width = 48
  * frame height = 11
  * sprite width = `48 * frameCount`
  * sprite height = 11
* Frames are placed left-to-right in chronological order.
* The sprite must be **binary** (only 0 and 255 grayscale values).

### 6.6.2 Client-side ffmpeg requirement

* Implement client-side ffmpeg via **ffmpeg.wasm** (or similar WebAssembly build).
* If ffmpeg cannot run (unsupported browser/memory constraints), show a clear message and disable render (since “no backend”).
* Cache the ffmpeg core in IndexedDB or browser cache where feasible to reduce load time.

### 6.6.3 Export procedure (conceptual)

* For video:

  * Extract frames at selected FPS within trimmed interval.
  * Apply scale/grayscale/threshold invert/crop.
  * Compose into a single-row sprite.
* For pixel animation:

  * Take each 48×11 frame from the editor, convert to grayscale (0/255).
  * Compose into a single-row sprite (ffmpeg optional; canvas composition allowed as long as output matches).

### 6.6.4 Download button

* Provide “Download sprite PNG” button.
* Filename convention example:

  * `badge_sprite_speed{SPEED}_{FPS}fps_{timestamp}.png`
* Download must work without server roundtrip (Blob URL).

---

## 6.7 Device connection and transmission (WebHID / WebUSB)

### 6.7.1 Device discovery and permissions

* Provide a “Connect badge” button.
* Implement:

  * WebHID `navigator.hid.requestDevice(...)` with filters if possible.
  * WebUSB `navigator.usb.requestDevice(...)` as fallback.
* Show current connection state:

  * Disconnected / Connected (HID) / Connected (USB)
* Provide “Disconnect” (logical disconnect; user may also unplug).

### 6.7.2 Data format to send

The system must define and document a transmission payload. Minimum requirements:

* Input: the rendered sprite PNG (single row).
* Convert the sprite into the badge’s expected format, typically:

  * Per-frame bitmap
  * Bit packing (1 bit per pixel) preferred for efficiency
* Frame timing:

  * Either encoded in the payload (speed/fps) or managed by the device (device setting).
* Because the device protocol is unknown, requirements include:

  * Identify whether the badge expects:

    * Raw frame buffer streaming
    * A file-like upload format
    * A specific command set (common for LED badges)
  * Create an internal abstraction:

    * `BadgeTransport` interface with `connect()`, `send(frames, fps)`, `disconnect()`
    * `WebHIDTransport` and `WebUSBTransport` implementations

### 6.7.3 Protocol requirement (blocking)

* The implementation must not ship as “complete” until one of these is true:

  * Protocol is obtained from vendor docs, or
  * Protocol is reverse engineered and verified with test uploads, or
  * A known open protocol exists for this device and is validated

### 6.7.4 UX for sending

* Provide “Send to badge” button (disabled until connected and sprite rendered).
* Show progress and final result:

  * Uploading… (percent if possible)
  * Success / Error with details (e.g., permission denied, transfer failed)
* Provide a “Test connection” action (optional but recommended).

### 6.7.5 Browser support note

* WebHID is supported in Chromium-based browsers; Safari/Firefox may not support it.
* The UI must detect support and display guidance (without blocking the rest of the app).

---

## 7) Non-Functional Requirements

### 7.1 Browser compatibility

* Primary: Latest Chrome / Edge (desktop).
* Secondary: Chromium-based browsers on supported OS.
* Provide graceful messaging if:

  * WebAssembly threads not available
  * WebHID/WebUSB unsupported

### 7.2 Performance

* Avoid freezing the UI:

  * Use Web Workers for ffmpeg processing where feasible.
* Enforce caps:

  * maximum frames
  * maximum input file size (soft cap with warning)
* Show estimated frames and sprite width before rendering.

### 7.3 Accessibility

* Keyboard navigable primary controls (tabs, buttons, sliders).
* Labels for inputs and ARIA where appropriate.
* Respect reduced motion (optional).

### 7.4 Privacy

* Explicitly state: “Processing happens locally in your browser. No uploads.”
* No analytics by default (unless explicitly required later).

---

## 8) Error Handling Requirements

* Invalid file type → show error and supported formats.
* Trim selection exceeds max duration → prevent render and explain.
* Too many frames / sprite too wide → block render; suggest lowering FPS or duration.
* ffmpeg load failure → show actionable guidance (reload, switch browser).
* Device connect failure → show permission instructions.
* Transmission failure → show transport type (HID/USB) and error detail.

---

## 9) Testing & Acceptance Criteria

### 9.1 Video render acceptance

* Given a test video:

  * selecting a 2-second trim at Speed 8 (15 fps) yields ~30 frames
  * output PNG dimensions: `48*frameCount` by `11`
  * pixels are only 0 or 255
  * preview matches exported sprite frames

### 9.2 Pixel animation acceptance

* Drawing 10 frames in timeline at Speed 3 (2.0 fps):

  * preview plays at 2 fps
  * export PNG: `480×11` (48*10)
  * frame order matches timeline order

### 9.3 GitHub Pages acceptance

* The deployed Pages URL loads without errors.
* All assets load under the repository base path.
* App functions without a server.

### 9.4 Device acceptance

* On a supported Chromium browser:

  * Connect badge succeeds
  * Send operation completes and badge displays the animation as expected (once protocol is confirmed)

---

## 10) Implementation Notes (Guidance, Not Design Lock)

* Prefer:

  * `ffmpeg.wasm` for video processing and/or sprite assembly.
  * Canvas-based assembly for pixel animation (simpler than calling ffmpeg).
* Keep a “single source of truth” internal model:

  * `frames: Uint8Array[]` or `ImageData[]` each 48×11 (binary)
* Use a shared renderer/exporter for both modes:

  * `renderFramesToSpritePNG(frames) -> Blob`

---

## 11) Open Items (Must Be Resolved During Implementation)

1. **Max video duration** value (seconds) — required config.
2. Pixel animation constraint: **max frames** or **max duration** — choose and document.
3. **Device protocol** for `0416:5020` badge:

   * HID reports? USB endpoints? frame packing? speed setting?
4. Choose and lock the **aspect handling policy** (center-crop recommended).
5. Decide whether sprite generation uses ffmpeg `tile` or canvas composition (both allowed as long as output matches).
