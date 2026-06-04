// Tauri v2 桥接脚本 —— 暴露与旧 Electron API 完全相同的 window.electronAPI 接口
// 使用 @tauri-apps/api 官方 API，renderer.js 无需任何改动
import { invoke } from './tauri-api/core.js';
import { listen } from './tauri-api/event.js';

let unlistenFn = null;

window.electronAPI = {
  // 选择目录
  selectDirectory() {
    return invoke('select_directory');
  },

  // 启动 Excel 处理
  startProcessing(config) {
    return invoke('start_processing', { config });
  },

  // 监听处理进度
  onProgress(callback) {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
    listen('processing:progress', (event) => {
      callback(event.payload);
    }).then(fn => {
      unlistenFn = fn;
    });
  },

  // 移除进度监听
  removeProgressListener() {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
  },

  // 打开目录
  openDirectory(dirPath) {
    return invoke('open_directory', { dirPath });
  },

  // 获取默认目录
  getDefaultDirectories() {
    return invoke('get_default_directories');
  },

  // 打开配置文件
  openConfigFile() {
    return invoke('open_config_file');
  },

  // 读取 Excel 文件表头
  readExcelHeaders(filePath) {
    return invoke('read_excel_headers', { filePath });
  },

  // 新增格式规则到 patterns.json
  addPattern(patternData) {
    return invoke('add_pattern', { input: patternData });
  },
};

console.log('[tauri-bridge] electronAPI 桥接就绪');
