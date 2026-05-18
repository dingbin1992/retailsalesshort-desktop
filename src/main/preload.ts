import { contextBridge, ipcRenderer } from 'electron';
import { ProcessingConfig, ProgressEvent, ProcessingResult } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // 选择目录
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),

  // 启动处理
  startProcessing: (config: ProcessingConfig): Promise<ProcessingResult> =>
    ipcRenderer.invoke('processing:start', config),

  // 监听进度
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

  // 打开目录
  openDirectory: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('shell:openDirectory', dirPath),

  // 获取默认目录
  getDefaultDirectories: (): Promise<{ workDir: string; outputDir: string }> =>
    ipcRenderer.invoke('config:getDefaults'),

  // 打开配置文件
  openConfigFile: (): Promise<void> =>
    ipcRenderer.invoke('config:openFile'),
});
