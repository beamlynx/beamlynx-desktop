// Intentionally minimal: the UI talks to the bundled server via plain
// fetch() against http://localhost:33333 (see beamlynx-ui/store/client.ts),
// same as it does against a Docker-run server today. The one thing the web
// UI genuinely can't do itself is know about Electron's auto-update
// lifecycle (see src/main/auto-update.ts) -- that's exposed here so
// beamlynx-ui can show it in-app instead of it being silent/console-only.
import { contextBridge, ipcRenderer } from 'electron';
import type { UpdateStatus } from '../main/auto-update';
import type {
  CredentialsStatus,
  GetConnectionResult,
  SaveConnectionInput,
  SaveConnectionResult,
  SavedConnectionMeta,
} from '../main/credential-store';

contextBridge.exposeInMainWorld('beamlynxDesktop', {
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
  credentials: {
    status: (): Promise<CredentialsStatus> => ipcRenderer.invoke('credentials:status'),
    list: (): Promise<SavedConnectionMeta[]> => ipcRenderer.invoke('credentials:list'),
    save: (input: SaveConnectionInput): Promise<SaveConnectionResult> =>
      ipcRenderer.invoke('credentials:save', input),
    get: (id: string): Promise<GetConnectionResult> => ipcRenderer.invoke('credentials:get', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('credentials:delete', id),
  },
});
