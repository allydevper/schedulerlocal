const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onAppClose: (callback) => ipcRenderer.on('app-closing', () => callback()),
    platform: process.platform
});
