// Preload script - runs in renderer before page loads
// Use contextBridge to safely expose APIs to renderer
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron
})
