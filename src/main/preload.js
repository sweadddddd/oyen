'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Secure bridge between the main process (which owns the global hooks, screen
// geometry, settings and watchers) and the renderer (which draws Oyen and
// decides the click-through hit-box).

contextBridge.exposeInMainWorld('oyen', {
  // ---- main -> renderer subscriptions ----
  onInput: (cb) => ipcRenderer.on('input', (_e, data) => cb(data)),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, data) => cb(data)),
  onFullscreen: (cb) => ipcRenderer.on('fullscreen', (_e, data) => cb(data)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, data) => cb(data)),
  onGeometry: (cb) => ipcRenderer.on('geometry', (_e, data) => cb(data)),
  onVisibility: (cb) => ipcRenderer.on('visibility', (_e, data) => cb(data)),

  // ---- renderer -> main requests ----
  // Report the cat's current interactive hit-box (in virtual-screen coords)
  // so the main process can toggle click-through precisely.
  setHitbox: (rects) => ipcRenderer.send('set-hitbox', rects),
  // Force click-through off while dragging (pointer capture), then release.
  setCapture: (capture) => ipcRenderer.send('set-capture', capture),
  openSettings: () => ipcRenderer.send('open-settings'),
  ready: () => ipcRenderer.send('renderer-ready'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  logError: (info) => ipcRenderer.send('renderer-error', info),
});
