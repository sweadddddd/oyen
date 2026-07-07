# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Oyen is an Electron desktop pet: a hand-pixel-art cat that lives as a transparent, click-through, always-on-top overlay across the whole virtual screen on Windows. Every frame is drawn on `<canvas>` via one parametric draw routine — there are no image assets checked in. She reacts to system-wide mouse/keyboard input (not just events inside her own window) via a native global hook.

## Commands

```bash
npm install        # also generates build/icon.png via postinstall (scripts/gen-icon.js)
npm start           # run in dev — electron .
npm run rebuild      # rebuild uiohook-napi's native binary against the installed Electron ABI
npm run build        # regenerate icon + electron-builder --win portable -> dist/OyenDesktopPet-<version>-portable.exe
```

There is no test suite and no linter configured — don't invent npm scripts for either.

Run `npm run rebuild` whenever the Electron version in `package.json` changes, or if the console logs `uiohook-napi unavailable` — prebuilt native binaries are ABI-specific to the Electron version.

CI (`.github/workflows/build-windows.yml`) builds the portable exe on `windows-latest`: push a `v*` tag to build+publish a GitHub Release, or trigger manually for an artifact-only build.

## Architecture

**Process split.** `src/main/main.js` owns one frameless/transparent/always-on-top `BrowserWindow` sized to the union of all displays. It's globally click-through (`setIgnoreMouseEvents(true, { forward: true })`); the renderer reports the cat's current hit-box via IPC (`set-hitbox`), and `main.js` re-enables mouse input only when the OS cursor is inside it (see `updateClickThrough`). This is the mechanism that lets clicks pass through to whatever app is beneath Oyen everywhere except her own body. `src/main/preload.js` is the only bridge between main and renderer (`contextIsolation: true`, exposed as `window.oyen`) — there's a second, separate preload (`settingsPreload.js`) for the Settings window.

**Global input has no in-app coupling to app focus.** `src/main/inputHooks.js` wraps `uiohook-napi` for system-wide mouse/keyboard capture regardless of which app is focused, and forwards normalized events over IPC. If the native module fails to load, `main.js` falls back to a lower-frequency `screen.getCursorScreenPoint()` poll (`startCursorPollFallback`) so the pet keeps at least a heartbeat of cursor-follow — hunt/knead/overheat/scroll still require the real hook.

**Renderer has no bundler.** `src/renderer/index.html` loads plain `<script>` tags in dependency order: `sprite.js` → `stateMachine.js` → `particles.js` → `speechBubble.js` → `sound.js` → `reminders.js` → `behaviors.js` → `overlay.js`. Each module does a dual export (`module.exports` and `window.X`) so the same file works whether required or loaded as a plain script. **If you add a new renderer file, add its `<script>` tag in the correct dependency position** — nothing auto-discovers renderer files.

**Sprite = one parametric draw function.** `src/renderer/sprite.js`'s `OYEN.draw(ctx, params)` renders every pose from a single routine driven by a parameter object (`OYEN.defaults()`); poses are just different parameter sets, and animation is parameter interpolation over time, not sprite frames. To add a new pose: add a `case` in `stateMachine.js`'s `OyenState.params()` (computes params for the current pose each frame from `t` seconds-in-pose), extend `sprite.js` defaults if a genuinely new parameter is needed, and trigger the pose transition from `behaviors.js` (input-reactive) or `reminders.js` (timer-based) via `cat.state.set('pose-name', { duration, next })`.

**Behavior priority order matters.** `behaviors.js`'s per-frame `update()` checks reactions in a fixed precedence (overheat > busy one-shot poses > petting/purr > kneading > hunt > eye-follow) — a new reactive behavior usually needs to be slotted into this chain deliberately, not just appended, or a higher-priority state will stomp it.

**Fullscreen/peek mode** (`src/main/foregroundWatcher.js`, via `active-win`) polls the focused window and tells the renderer to shrink into an edge-docked peek pose when a fullscreen app has focus, so Oyen doesn't cover games/video.

**Settings** (`src/main/settingsStore.js`) persist to `oyen-settings.json` in Electron's per-user data dir and are pushed to the renderer over IPC (`pushSettings`) on load and after every update; the Settings window is a second, independent `BrowserWindow`/preload pair.

**Agent-status hook** (`src/main/statusWatcher.js`) watches a JSON file (default `~/.oyen-status.json`, path configurable in Settings) for `{ status: "thinking" | "done" | "idle" }` and drives a thinking overlay / happy-jump pose — see `scripts/oyen-status.sh` for the intended external write pattern.

**Debugging a broken/blank overlay:** set `OYEN_DEBUG=1` (or pass `--debug`) to auto-open detached DevTools on the overlay window; regardless of that flag, `main.js` always appends uncaught exceptions, renderer console warnings/errors, and load failures to `<userData>/oyen-debug.log` (reachable from the tray menu) since a machine you can't attach a debugger to is the common failure case for this app.

**No image assets.** The app icon is rasterized at build time from `src/shared/oyenIcon.js` + `src/shared/pngEncoder.js` via `scripts/gen-icon.js` (runs on `postinstall`/`prebuild`) — never add binary icon/image files to the repo for this.
