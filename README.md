# 🐱 Oyen Desktop Pet

Oyen is a hand-pixel-art ginger cat that lives on top of your Windows desktop.
She's drawn entirely in code (no image files — every frame is rendered on a
`<canvas>`), floats over all your apps with full click-through, and reacts to
**system-wide** input: your mouse, scrolling, and typing in *any* application,
not just inside her own window.

Built with **Electron + Node**, packaged as a single portable `.exe` that runs
with zero admin rights and no install step.

---

## Features

**Reactive behaviors** (all driven by a global input hook, so they fire no
matter which app you're using):

- **Eye-follow** — her pupils track your cursor when it's nearby.
- **Mochi drag** — grab her body and fling her around; she stretches elastically
  toward the cursor and snaps back with a wobble and a little bounce.
- **Mouse hunt** — flick the cursor fast near her and she crouches, then pounces
  along your cursor's path.
- **Purr pets** — hover + gently wiggle over her head and she squints, blushes
  and purrs (with a soft procedural purr sound).
- **Keyboard knead** — she kneads her paws in time with your typing.
- **Overheat** — type *really* fast and she overheats: red tint + steam puffs,
  then cools back down.
- **Scroll unroll** — spin the scroll wheel and she grips and pulls a little
  paper scroll that unspools beneath her paws.
- **Peek mode** — when a fullscreen app/game is focused she shrinks to a small
  peek pose docked at the screen edge and gets out of the way.

**Timers & reminders:**

- **Stretch reminder** — every _N_ minutes she grows tall and stretches.
- **Pomodoro** — focus/break timer with a pixel countdown next to her; she's
  sleepier during breaks.
- **Timed message** — set a time + text and she does a meow-bounce with a
  speech bubble.
- **Pinned note** — a persistent little bubble above her head.
- **Your name** — interpolated into messages (`Hey {name}, stretch time!`).

**Poses / animations:** idle-blink, walk, sit, sleep, eye-follow, stretch-tall,
hunt-crouch, pounce, purr, knead, overheat, scroll-pull, peek, jump-happy,
plus thinking & meow.

**Agent-status hook (optional):** Oyen watches `~/.oyen-status.json` for
`{ "status": "thinking" | "done" | "idle" }`. `thinking` shows a thinking
overlay; `done` plays the happy jump. Drive it from any workflow — see
[`scripts/oyen-status.sh`](scripts/oyen-status.sh).

**System tray:** show/hide Oyen, open Settings, quit.

---

## Requirements

- **Windows 10/11 x64** (the reactive input hooks target Windows).
- **Node.js 18+** and npm (for development / building).

> The app can be developed on macOS/Linux too, but the global input hook
> (`uiohook-napi`) and fullscreen detection (`active-win`) are most reliable on
> Windows, which is the packaging target.

---

## Getting started

```bash
npm install
```

`npm install` also generates the app icon (`build/icon.png`) from the hand-coded
Oyen face via the `postinstall` hook — no image files are checked in.

### Run in dev / test

```bash
npm start
```

Oyen appears over your desktop and a cat icon shows up in the system tray.
Right-click the tray icon for Show/Hide, Settings and Quit.

### Native module rebuild (if input hooks don't work)

`uiohook-napi` ships prebuilt binaries, but they must match your installed
Electron's ABI. If Oyen starts but doesn't react to mouse/keyboard (check the
console for `uiohook-napi unavailable`), rebuild the native module against
Electron:

```bash
npm run rebuild
```

This runs `@electron/rebuild` for `uiohook-napi`. Re-run it whenever you change
the Electron version in `package.json`.

> If the native hook can't load at all, Oyen still runs and falls back to a
> lower-frequency cursor-follow poll (via Electron's `screen` API) so she isn't
> completely inert — but hunt/knead/overheat/scroll need the global hook.

### Build the portable .exe

```bash
npm run build
```

This regenerates the icon and runs `electron-builder --win portable`, producing
a single standalone executable in `dist/`:

```
dist/OyenDesktopPet-1.0.0-portable.exe
```

Copy that `.exe` anywhere and double-click it — no installer, no admin rights.

> Building a Windows target is easiest **on Windows**. Building from
> macOS/Linux requires Wine for `electron-builder`'s Windows packaging.

### Automated builds (GitHub Actions)

A Windows CI workflow ([`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml))
builds the portable `.exe` on a `windows-latest` runner:

- **Push a version tag** (e.g. `git tag v1.0.0 && git push origin v1.0.0`) to
  build **and publish** the `.exe` to a GitHub **Release** — a permanent
  download URL.
- **Run workflow** manually (Actions tab) to build the `.exe` as a downloadable
  workflow **artifact**.

This is the recommended way to obtain a distributable binary without a local
Windows machine. (GitHub Actions must be enabled for the repository.)

---

## Settings

Open **Settings** from the tray icon. Everything auto-saves:

| Setting            | Description                                        |
| ------------------ | -------------------------------------------------- |
| Your name          | Interpolated into reminder text as `{name}`        |
| Sprite scale       | Pixel scaling (3–7×)                                |
| Mute sounds        | Silence purr/meow/chirps                           |
| Stretch reminder   | On/off + interval in minutes (default 50)          |
| Pomodoro           | On/off + focus/break minutes (default 25/5)        |
| Timed message      | On/off + time + custom text                        |
| Pinned note        | Persistent bubble above her head                   |
| Agent status       | Watch a status file + its path                      |

Settings persist to `oyen-settings.json` in Electron's per-user data directory.

---

## Agent-status integration

Make [`scripts/oyen-status.sh`](scripts/oyen-status.sh) executable and call it
from your own workflow to make Oyen react:

```bash
chmod +x scripts/oyen-status.sh

./scripts/oyen-status.sh thinking     # long task starting…
npm test && ./scripts/oyen-status.sh done || ./scripts/oyen-status.sh idle
```

On Windows you can write the same JSON from PowerShell:

```powershell
'{ "status": "thinking" }' | Set-Content "$env:USERPROFILE\.oyen-status.json"
```

Point Oyen at a different file (and set `OYEN_STATUS_FILE` for the script to
match) in **Settings → Agent status**.

---

## How it works

- **Overlay window** (`src/main/main.js`): a frameless, transparent,
  always-on-top `BrowserWindow` sized to the union of all displays (the virtual
  screen). It's globally click-through via
  `setIgnoreMouseEvents(true, { forward: true })`; the renderer reports the
  cat's current hit-box and the main process re-enables mouse input **only**
  when the OS cursor is inside it, so clicks pass through everywhere else.
- **Global input** (`src/main/inputHooks.js`): `uiohook-napi` captures
  system-wide mouse move/speed, clicks, scroll and keystrokes and forwards
  normalized events to the renderer.
- **Fullscreen detection** (`src/main/foregroundWatcher.js`): `active-win`
  polls the focused window; if it covers a whole display, Oyen enters peek mode.
- **Sprite** (`src/renderer/sprite.js`): one parametric pixel-art draw routine;
  every pose is just a different parameter set, so animations are parameter
  interpolation. Rendered at a small base resolution and CSS-scaled with
  `image-rendering: pixelated`.
- **State machine / behaviors / reminders / particles / sound**: the rest of
  `src/renderer/` — pose transitions, input-reactive logic, timers, steam/paper
  effects, and procedural WebAudio purr/meow (no audio files).

### Project layout

```
src/
  main/       Electron main process (window, tray, hooks, watchers, IPC)
  renderer/   Oyen overlay: sprite, state machine, behaviors, reminders, fx
  settings/   Settings window (HTML/CSS/JS)
  shared/     PNG encoder + icon rasterizer (used for tray/app icons)
scripts/
  gen-icon.js       Generates build/icon.png from the Oyen face
  oyen-status.sh    Example agent-status writer
```

---

## License

MIT
