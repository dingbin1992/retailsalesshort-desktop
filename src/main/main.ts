import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { registerIpcHandlers, setPatterns } from './ipc-handlers';
import { PatternsConfig } from '../shared/types';

function loadPatternsConfig(): PatternsConfig {
  // 优先从 app 资源目录加载，开发时从项目目录加载
  const possiblePaths = [
    path.join(path.dirname(app.getPath('exe')), 'resources', 'config', 'patterns.json'), // 打包后
    path.join(app.getAppPath(), 'config', 'patterns.json'), // 开发时
    path.join(process.resourcesPath || '', 'config', 'patterns.json'), // extraResources
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const config: PatternsConfig = JSON.parse(raw);
        // 将 JSON 中的字符串 key 转为数字 key
        config.patterns.forEach(pattern => {
          pattern.headers = convertKeysToNumber(pattern.headers);
          pattern.mapping = convertKeysToNumber(pattern.mapping);
        });
        console.log(`已加载配置: ${p}, ${config.patterns.length} 个格式模式`);
        return config;
      }
    } catch {
      // 继续尝试下一个路径
    }
  }

  throw new Error('无法加载 patterns.json 配置文件');
}

function convertKeysToNumber(obj: Record<string, any>): Record<number, any> {
  const result: Record<number, any> = {};
  for (const key of Object.keys(obj)) {
    result[parseInt(key, 10)] = obj[key];
  }
  return result;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: '流向整理工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  const config = loadPatternsConfig();
  setPatterns(config.patterns);
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
