// 格式模式定义（从 patterns.json 加载的结构）
// 支持两种格式：
//   旧格式(数字键): headers { "1": "header1", ... }, mapping { "1": 1, ... }
//   新格式(a-f键):  headers { "a": "header1", ... }, mapping { "a": 1, ... }
export interface PatternDefinition {
  name: string;
  businessUnit: string;
  headers: Record<string, string>;
  mapping: Record<string, number>;
  dateFormat?: boolean;
  dateCol?: number;
}

// patterns.json 的顶层结构
export interface PatternsConfig {
  version: string;
  patterns: PatternDefinition[];
}

// 处理配置（从渲染进程传入）
export interface ProcessingConfig {
  workDir: string;
  outputDir: string;
  yearMonth: string; // 用户选择的年月，格式如 "2025年11月"
}

// 处理进度事件（主进程推送至渲染进程）
export interface ProgressEvent {
  type: 'scanning' | 'processing' | 'writing' | 'cleaning' | 'complete' | 'error';
  currentFile?: string;
  fileIndex?: number;
  totalFiles?: number;
  rowsProcessed?: number;
  totalRows?: number;
  message: string;
  error?: string;
}

// 处理结果（处理完成后返回）
export interface ProcessingResult {
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
