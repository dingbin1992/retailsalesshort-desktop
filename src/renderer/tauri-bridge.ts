// Tauri v2 桥接脚本 —— 暴露与旧 Electron API 相同的 window.electronAPI 接口
// 使用 @tauri-apps/api 官方 API
declare const window: Window & {
  electronAPI?: ElectronAPI;
};

interface ProcessingConfig {
  workDir: string;
  outputDir: string;
  yearMonth: string;
}

interface ProgressEventPayload {
  type: string;
  message: string;
  currentFile?: string;
  fileIndex?: number;
  totalFiles?: number;
  rowsProcessed?: number;
  totalRows?: number;
  error?: string;
}

interface ProcessingResult {
  success: boolean;
  totalFiles: number;
  processedFiles: number;
  totalRows: number;
  processedRows: number;
  summaryFilePath: string;
  targetFilePath: string;
  baseTablePath: string;
  baseDir: string;
  unmatchedFiles: string[];
  errors: string[];
}

interface DefaultDirs {
  workDir: string;
  outputDir: string;
}

interface PatternData {
  businessUnit: string;
  headers: Record<string, string>;
  mapping: Record<string, number>;
}

interface ElectronAPI {
  selectDirectory(): Promise<string | null>;
  startProcessing(config: ProcessingConfig): Promise<ProcessingResult>;
  onProgress(callback: (event: ProgressEventPayload) => void): void;
  removeProgressListener(): void;
  openDirectory(dirPath: string): Promise<void>;
  getDefaultDirectories(): Promise<DefaultDirs>;
  openConfigFile(): Promise<void>;
  readExcelHeaders(filePath: string): Promise<string[]>;
  addPattern(patternData: PatternData): Promise<string>;
  getPatternsConfig(): Promise<string>;
  updatePattern(name: string, patternData: PatternData): Promise<boolean>;
  deletePattern(name: string): Promise<boolean>;
  exportPatterns(json: string): Promise<string | null>;
  importPatterns(): Promise<string | null>;
}

import { invoke } from './tauri-api/core.js';
import { listen } from './tauri-api/event.js';

let unlistenFn: (() => void) | null = null;

window.electronAPI = {
  selectDirectory(): Promise<string | null> {
    return invoke('select_directory');
  },

  startProcessing(config: ProcessingConfig): Promise<ProcessingResult> {
    return invoke('start_processing', { config });
  },

  onProgress(callback: (event: ProgressEventPayload) => void): void {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
    listen<ProgressEventPayload>('processing:progress', (event) => {
      callback(event.payload);
    }).then((fn) => {
      unlistenFn = fn;
    });
  },

  removeProgressListener(): void {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
  },

  openDirectory(dirPath: string): Promise<void> {
    return invoke('open_directory', { dirPath });
  },

  getDefaultDirectories(): Promise<DefaultDirs> {
    return invoke('get_default_directories');
  },

  openConfigFile(): Promise<void> {
    return invoke('open_config_file');
  },

  readExcelHeaders(filePath: string): Promise<string[]> {
    return invoke('read_excel_headers', { filePath });
  },

  addPattern(patternData: PatternData): Promise<string> {
    return invoke('add_pattern', { input: patternData });
  },

  getPatternsConfig(): Promise<string> {
    return invoke('get_patterns_config');
  },

  updatePattern(name: string, patternData: PatternData): Promise<boolean> {
    return invoke('update_pattern', { name, patternData });
  },

  deletePattern(name: string): Promise<boolean> {
    return invoke('delete_pattern', { name });
  },

  exportPatterns(json: string): Promise<string | null> {
    return invoke('export_patterns_file', { json });
  },

  importPatterns(): Promise<string | null> {
    return invoke('import_patterns_file');
  },
};

console.log('[tauri-bridge] electronAPI 桥接就绪');
