'use strict';

const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');

const { SettingsStore } = require('./settingsStore');
const { InputHooks } = require('./inputHooks');
const { ForegroundWatcher } = require('./foregroundWatcher');
const { StatusWatcher } = require('./statusWatcher');
const { createTray } = require('./tray');
const { encodePNG } = require('../shared/pngEncoder');
const { renderOyenIcon } = require('../shared/oyenIcon');
const fs = require('fs');

// --- Debug logging ---------------------------------------------------------
// Appends to <userData>/oyen-debug.log so problems on machines we can't attach
// to (a blank overlay, a native-module failure) leave a trace the user can
// share. Also honoured: set OYEN_DEBUG=1 to auto-open the overlay DevTools.
const DEBUG = process.env.OYEN_DEBUG === '1' || process.argv.includes('--debug');
let logFilePath = null;
function logDebug(...parts) {
  const line = `[${new Date().toISOString()}] ${parts
    .map((p) => (typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ')}\n`;
  try {
    if (logFilePath) fs.appendFileSync(logFilePath, line);
  } catch (e) {
    /* ignore */
  }
  if (DEBUG) console.log(line.trimEnd());
}

process.on('uncaughtException', (err) => {
  logDebug('uncaughtException', err && (err.stack || err.message || String(err)));
});
process.on('unhandledRejection', (reason) => {
  logDebug('unhandledRejection', String(reason));
});

// Single instance — a desktop pet should never spawn duplicates.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let overlayWin = null;
let settingsWin = null;
let trayCtl = null;
let settings = null;
let input = null;
let foreground = null;
let statusWatcher = null;

// Current interactive hit-box(es) in virtual-screen coordinates, reported by
// the renderer. Click-through is disabled only when the OS cursor is inside one.
let hitboxes = [];
let dragCapture = false;
let overlayVisible = true;

// Union bounds of every display (the "virtual screen").
function getVirtualBounds() {
  const displays = screen.getAllDisplays();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    const b = d.bounds;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function sendGeometry() {
  if (!overlayWin) return;
  const vb = getVirtualBounds();
  overlayWin.webContents.send('geometry', {
    virtual: vb,
    displays: screen.getAllDisplays().map((d) => ({
      bounds: d.bounds,
      scaleFactor: d.scaleFactor,
    })),
    primary: screen.getPrimaryDisplay().bounds,
  });
}

function createOverlay() {
  const vb = getVirtualBounds();

  overlayWin = new BrowserWindow({
    x: vb.x,
    y: vb.y,
    width: vb.width,
    height: vb.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Stay above virtually everything, and visible across all workspaces.
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === 'win32') {
    // Keep out of Alt-Tab / window switching.
    overlayWin.setSkipTaskbar(true);
  }

  // Global click-through; individual regions re-enabled from cursor tracking.
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Diagnostics so a blank/broken renderer isn't a silent failure.
  const wc = overlayWin.webContents;
  wc.on('did-fail-load', (_e, code, desc, url) =>
    logDebug('overlay did-fail-load', code, desc, url)
  );
  wc.on('preload-error', (_e, p, err) =>
    logDebug('overlay preload-error', p, err && err.message)
  );
  wc.on('render-process-gone', (_e, details) =>
    logDebug('overlay render-process-gone', details)
  );
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    // level 2 = warning, 3 = error; capture those (CSP violations show here).
    if (level >= 2) logDebug('overlay console', message, `${sourceId}:${line}`);
  });

  overlayWin.once('ready-to-show', () => {
    overlayWin.show();
    sendGeometry();
    pushSettings();
    logDebug('overlay ready-to-show; virtual', getVirtualBounds());
    if (DEBUG) wc.openDevTools({ mode: 'detach' });
  });

  overlayWin.on('closed', () => {
    overlayWin = null;
  });
}

// Decide, from the OS cursor position, whether the overlay should receive the
// mouse (cursor is over the cat) or pass clicks through to apps beneath.
function updateClickThrough(cursor) {
  if (!overlayWin) return;
  let interactive = dragCapture;
  if (!interactive && cursor) {
    for (const r of hitboxes) {
      if (
        cursor.x >= r.x &&
        cursor.x <= r.x + r.w &&
        cursor.y >= r.y &&
        cursor.y <= r.y + r.h
      ) {
        interactive = true;
        break;
      }
    }
  }
  overlayWin.setIgnoreMouseEvents(!interactive, { forward: true });
}

function pushSettings() {
  if (overlayWin) overlayWin.webContents.send('settings', settings.get());
}

// ---- Input wiring ----
function wireInput() {
  input = new InputHooks();

  const forward = (type) => (data) => {
    if (overlayWin && overlayVisible) {
      overlayWin.webContents.send('input', { type, ...data });
    }
  };

  input.on('mousemove', (data) => {
    // Click-through is driven by the true OS cursor position.
    updateClickThrough({ x: data.x, y: data.y });
    if (overlayWin && overlayVisible) {
      overlayWin.webContents.send('input', { type: 'mousemove', ...data });
    }
  });
  input.on('mousedown', forward('mousedown'));
  input.on('mouseup', forward('mouseup'));
  input.on('click', forward('click'));
  input.on('wheel', forward('wheel'));
  input.on('keydown', forward('keydown'));
  input.on('keyup', forward('keyup'));

  input.start();

  if (!input.available) {
    // Fallback: without a global hook we can still follow the cursor with a
    // low-frequency Electron poll so the pet isn't completely inert.
    startCursorPollFallback();
  }
}

let fallbackTimer = null;
function startCursorPollFallback() {
  let last = screen.getCursorScreenPoint();
  let lastT = Date.now();
  fallbackTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const now = Date.now();
    const dt = Math.max(1, now - lastT);
    const speed = (Math.hypot(p.x - last.x, p.y - last.y) / dt) * 1000;
    updateClickThrough(p);
    if (overlayWin && overlayVisible) {
      overlayWin.webContents.send('input', {
        type: 'mousemove',
        x: p.x,
        y: p.y,
        speed,
        dx: p.x - last.x,
        dy: p.y - last.y,
        trail: [{ x: p.x, y: p.y, t: now }],
      });
    }
    last = p;
    lastT = now;
  }, 60);
}

// ---- Foreground / fullscreen (peek mode) ----
function wireForeground() {
  foreground = new ForegroundWatcher(screen, { intervalMs: 1500 });
  foreground.on('change', (data) => {
    if (overlayWin) overlayWin.webContents.send('fullscreen', data);
  });
  foreground.start();
}

// ---- Agent status file watcher ----
function wireStatus() {
  statusWatcher = new StatusWatcher(settings.get().statusFile);
  statusWatcher.on('status', (status) => {
    if (overlayWin) overlayWin.webContents.send('status', status);
  });
  if (settings.get().statusWatchEnabled) statusWatcher.start();
}

// ---- Settings window ----
function openSettingsWindow() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    title: 'Oyen Settings',
    icon: appIconImage(),
    webPreferences: {
      preload: path.join(__dirname, 'settingsPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, '..', 'settings', 'settings.html'));
  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}

function appIconImage() {
  const { rgba } = renderOyenIcon(64);
  return nativeImage.createFromBuffer(encodePNG(rgba, 64, 64));
}

function toggleOverlayVisible() {
  overlayVisible = !overlayVisible;
  if (!overlayWin) return;
  if (overlayVisible) overlayWin.showInactive();
  else overlayWin.hide();
  overlayWin.webContents.send('visibility', { visible: overlayVisible });
}

// ---- IPC ----
function wireIpc() {
  ipcMain.on('set-hitbox', (_e, rects) => {
    hitboxes = Array.isArray(rects) ? rects : [];
    // Re-evaluate against the current cursor so click-through stays correct
    // even when the cat moves under a stationary pointer.
    if (!dragCapture) updateClickThrough(screen.getCursorScreenPoint());
  });
  ipcMain.on('set-capture', (_e, capture) => {
    dragCapture = !!capture;
    if (dragCapture) {
      if (overlayWin) overlayWin.setIgnoreMouseEvents(false, { forward: true });
    } else {
      updateClickThrough(screen.getCursorScreenPoint());
    }
  });
  ipcMain.on('open-settings', openSettingsWindow);
  ipcMain.on('close-settings', () => {
    if (settingsWin) settingsWin.close();
  });
  ipcMain.on('renderer-ready', () => {
    sendGeometry();
    pushSettings();
    logDebug('renderer-ready');
  });
  ipcMain.on('renderer-error', (_e, info) => logDebug('renderer-error', info));

  ipcMain.handle('get-settings', () => settings.get());
  ipcMain.handle('update-settings', (_e, patch) => {
    const next = settings.update(patch || {});
    pushSettings();
    // Re-point the status watcher if the file path changed.
    if (statusWatcher) {
      if (next.statusWatchEnabled) {
        statusWatcher.setFile(next.statusFile);
        statusWatcher.start();
      } else {
        statusWatcher.stop();
      }
    }
    return next;
  });
}

function onDisplaysChanged() {
  if (!overlayWin) return;
  const vb = getVirtualBounds();
  overlayWin.setBounds(vb);
  sendGeometry();
}

app.on('second-instance', () => {
  if (settingsWin) settingsWin.focus();
});

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.oyen.desktoppet');

  logFilePath = path.join(app.getPath('userData'), 'oyen-debug.log');
  logDebug('app ready', 'v' + app.getVersion(), process.platform, process.arch);

  settings = new SettingsStore(app.getPath('userData'));

  createOverlay();
  wireIpc();
  wireInput();
  wireForeground();
  wireStatus();

  logDebug('input hook available:', input ? input.available : false);

  trayCtl = createTray({
    isVisible: () => overlayVisible,
    onToggleShow: toggleOverlayVisible,
    onOpenSettings: openSettingsWindow,
    onQuit: () => app.quit(),
    onToggleDevTools: () => {
      if (!overlayWin) return;
      const wc = overlayWin.webContents;
      if (wc.isDevToolsOpened()) wc.closeDevTools();
      else wc.openDevTools({ mode: 'detach' });
    },
    onOpenLog: () => {
      if (logFilePath) shell.showItemInFolder(logFilePath);
    },
  });

  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);
});

app.on('window-all-closed', () => {
  // Intentionally does nothing: registering a listener overrides Electron's
  // default "quit when all windows are closed" so Oyen keeps living in the
  // tray even while the overlay is hidden. Quit only happens via the tray.
});

app.on('before-quit', () => {
  try {
    if (input) input.stop();
    if (foreground) foreground.stop();
    if (statusWatcher) statusWatcher.stop();
    if (fallbackTimer) clearInterval(fallbackTimer);
  } catch (err) {
    // ignore teardown errors
  }
});
