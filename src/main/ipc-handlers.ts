import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ProcessingConfig } from '../shared/types';
import { ExcelProcessor } from './excel-processor';
import { PatternDefinition } from '../shared/types';

let patterns: PatternDefinition[] = [];

export function setPatterns(p: PatternDefinition[]): void {
  patterns = p;
}

function getConfigPath(): string {
  const possiblePaths = [
    path.join(path.dirname(app.getPath('exe')), 'resources', 'config', 'patterns.json'),
    path.join(app.getAppPath(), 'config', 'patterns.json'),
    path.join(process.resourcesPath || '', 'config', 'patterns.json'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return possiblePaths[0];
}

export function registerIpcHandlers(): void {
  // 目录选择
  ipcMain.handle('dialog:selectDirectory', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // 获取默认目录（需求第5点）
  ipcMain.handle('config:getDefaults', async () => {
    return {
      workDir: app.getPath('downloads'),
      outputDir: 'H:\\0、工作\\0、每日纯销统计\\实时下载流向数据',
    };
  });

  // 打开配置文件
  ipcMain.handle('config:openFile', async (): Promise<void> => {
    const configPath = getConfigPath();
    await shell.openPath(configPath);
  });

  // 打开目录
  ipcMain.handle('shell:openDirectory', async (_event, dirPath: string): Promise<void> => {
    await shell.openPath(dirPath);
  });

  // 启动处理（需求第6点）
  ipcMain.handle('processing:start', async (event, config: ProcessingConfig) => {
    const processor = new ExcelProcessor(
      config.workDir,
      config.outputDir,
      config.yearMonth,
      patterns,
    );

    const win = BrowserWindow.fromWebContents(event.sender);
    processor.setProgressCallback((progressEvent) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('processing:progress', progressEvent);
      }
    });

    const result = await processor.run();
    return result;
  });
}
