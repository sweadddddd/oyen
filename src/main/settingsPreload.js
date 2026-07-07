'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Bridge for the settings window.
contextBridge.exposeInMainWorld('oyenSettings', {
  load: () => ipcRenderer.invoke('get-settings'),
  save: (patch) => ipcRenderer.invoke('update-settings', patch),
  close: () => ipcRenderer.send('close-settings'),
});
