const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Worker control
    startWorker: (config) => ipcRenderer.invoke('start-worker', config),
    stopWorker: () => ipcRenderer.invoke('stop-worker'),
    getWorkerStatus: () => ipcRenderer.invoke('get-worker-status'),

    // Configuration
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),

    // Docker stats
    getDockerStats: () => ipcRenderer.invoke('get-docker-stats'),

    // Event listeners
    onWorkerOutput: (callback) => {
        ipcRenderer.on('worker-output', (event, data) => callback(data));
    },
    onWorkerStopped: (callback) => {
        ipcRenderer.on('worker-stopped', (event, data) => callback(data));
    },
    onWorkerError: (callback) => {
        ipcRenderer.on('worker-error', (event, data) => callback(data));
    },
});
