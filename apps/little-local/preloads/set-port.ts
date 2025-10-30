import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    setPort: (port: number) => ipcRenderer.send('set-port', port),
});
