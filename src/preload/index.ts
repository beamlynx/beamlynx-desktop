// Intentionally minimal: the UI talks to the bundled server via plain
// fetch() against http://localhost:33333 (see beamlynx-ui/store/client.ts),
// same as it does against a Docker-run server today. The one thing the web
// UI genuinely can't do itself is know about Electron's auto-update
// lifecycle (see src/main/auto-update.ts) -- that's exposed here so
// beamlynx-ui can show it in-app instead of it being silent/console-only.
import { contextBridge, ipcRenderer } from 'electron';
import type { UpdateStatus } from '../main/auto-update';

contextBridge.exposeInMainWorld('beamlynxDesktop', {
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
});
