import { contextBridge, ipcRenderer } from 'electron';
import { ProcessingConfig, ProgressEvent, ProcessingResult } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),

  startProcessing: (config: ProcessingConfig): Promise<ProcessingResult> =>
    ipcRenderer.invoke('processing:start', config),

  onProgress: (callback: (event: ProgressEvent) => void): void => {
    const handler = (_event: any, data: ProgressEvent) => callback(data);
    ipcRenderer.on('processing:progress', handler);
    (window as any).__progressHandler = handler;
  },

  removeProgressListener: (): void => {
    const handler = (window as any).__progressHandler;
    if (handler) {
      ipcRenderer.removeListener('processing:progress', handler);
      delete (window as any).__progressHandler;
    }
  },

  openDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('shell:openDirectory', dirPath),

  getDefaultDirectories: (): Promise<{ workDir: string; outputDir: string }> =>
    ipcRenderer.invoke('config:getDefaults'),

  openConfigFile: (): Promise<void> =>
    ipcRenderer.invoke('config:openFile'),
});
