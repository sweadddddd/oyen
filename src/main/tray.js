'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const { encodePNG } = require('../shared/pngEncoder');
const { renderOyenIcon } = require('../shared/oyenIcon');

// Builds the system-tray icon (generated from the hand-coded Oyen face, no
// image file) with show/hide, settings and quit controls.

function makeTrayImage() {
  const size = 16;
  const { rgba } = renderOyenIcon(size);
  const png = encodePNG(rgba, size, size);
  const img = nativeImage.createFromBuffer(png);
  return img;
}

function createTray({
  onToggleShow,
  onOpenSettings,
  onQuit,
  isVisible,
  onToggleDevTools,
  onOpenLog,
}) {
  const tray = new Tray(makeTrayImage());
  tray.setToolTip('Oyen Desktop Pet');

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: isVisible() ? 'Hide Oyen' : 'Show Oyen',
        click: () => {
          onToggleShow();
          rebuild();
        },
      },
      { type: 'separator' },
      { label: 'Settings…', click: onOpenSettings },
      {
        label: 'Troubleshoot',
        submenu: [
          { label: 'Toggle DevTools', click: () => onToggleDevTools && onToggleDevTools() },
          { label: 'Open debug log…', click: () => onOpenLog && onOpenLog() },
        ],
      },
      { type: 'separator' },
      { label: 'Quit', click: onQuit },
    ]);
    tray.setContextMenu(menu);
  };

  rebuild();

  // Double-click toggles visibility as a convenience.
  tray.on('double-click', () => {
    onToggleShow();
    rebuild();
  });

  return { tray, rebuild };
}

module.exports = { createTray };
