import * as fs from 'fs';
import * as path from 'path';
import { ExcelProcessor } from './excel-processor';
import { PatternDefinition, PatternsConfig, ProcessingConfig, ProgressEvent, ProcessingResult } from './types';

interface CliInput {
  workDir: string;
  outputDir: string;
  yearMonth: string;
  patternsPath: string;
}

function convertKeysToNumber(obj: Record<string, any>): Record<number, any> {
  const result: Record<number, any> = {};
  for (const key of Object.keys(obj)) {
    result[parseInt(key, 10)] = obj[key];
  }
  return result;
}

function loadPatterns(patternsPath: string): PatternDefinition[] {
  const possiblePaths = [
    patternsPath,
    path.join('config', 'patterns.json'),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const config: PatternsConfig = JSON.parse(raw);
        config.patterns.forEach(pattern => {
          pattern.headers = convertKeysToNumber(pattern.headers as any);
          pattern.mapping = convertKeysToNumber(pattern.mapping as any);
        });
        console.error('[cli] 已加载配置: ' + p + ', ' + config.patterns.length + ' 个格式模式');
        return config.patterns;
      }
    } catch (e: any) {
      console.error('[cli] 加载配置失败: ' + p + ' - ' + e.message);
    }
  }

  throw new Error('无法加载 patterns.json 配置文件，尝试的路径: ' + possiblePaths.join(', '));
}

function emitProgress(event: ProgressEvent): void {
  const line = JSON.stringify({ type: 'progress', event });
  process.stdout.write(line + '\n');
}

function emitResult(result: ProcessingResult): void {
  const line = JSON.stringify({ type: 'result', data: result });
  process.stdout.write(line + '\n');
}

async function main(): Promise<void> {
  // 从命令行参数读取配置文件路径
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('[cli] 错误: 缺少配置文件路径参数');
    emitResult({
      success: false,
      totalFiles: 0,
      processedFiles: 0,
      totalRows: 0,
      processedRows: 0,
      summaryFilePath: '',
      targetFilePath: '',
      baseTablePath: '',
      baseDir: '',
      unmatchedFiles: [],
      errors: ['缺少配置文件路径参数'],
    });
    return;
  }

  const configFilePath = args[0];
  let input: CliInput;
  try {
    const raw = fs.readFileSync(configFilePath, 'utf-8');
    input = JSON.parse(raw);
    // 读取完毕后删除临时配置文件
    try { fs.unlinkSync(configFilePath); } catch (_) { /* 忽略 */ }
  } catch (e: any) {
    console.error('[cli] 读取配置失败: ' + e.message);
    emitResult({
      success: false,
      totalFiles: 0,
      processedFiles: 0,
      totalRows: 0,
      processedRows: 0,
      summaryFilePath: '',
      targetFilePath: '',
      baseTablePath: '',
      baseDir: '',
      unmatchedFiles: [],
      errors: ['读取配置失败: ' + e.message],
    });
    return;
  }

  console.error('[cli] 工作目录: ' + input.workDir);
  console.error('[cli] 输出目录: ' + input.outputDir);
  console.error('[cli] 年月: ' + input.yearMonth);

  let patterns: PatternDefinition[];
  try {
    patterns = loadPatterns(input.patternsPath);
  } catch (e: any) {
    console.error('[cli] 加载模式配置失败: ' + e.message);
    emitResult({
      success: false,
      totalFiles: 0,
      processedFiles: 0,
      totalRows: 0,
      processedRows: 0,
      summaryFilePath: '',
      targetFilePath: '',
      baseTablePath: '',
      baseDir: '',
      unmatchedFiles: [],
      errors: ['加载模式配置失败: ' + e.message],
    });
    return;
  }

  const config: ProcessingConfig = {
    workDir: input.workDir,
    outputDir: input.outputDir,
    yearMonth: input.yearMonth,
  };

  const processor = new ExcelProcessor(
    config.workDir,
    config.outputDir,
    config.yearMonth,
    patterns,
  );

  processor.setProgressCallback((event: ProgressEvent) => {
    emitProgress(event);
  });

  try {
    const result = await processor.run();
    emitResult(result);
  } catch (e: any) {
    console.error('[cli] 处理异常: ' + e.message);
    console.error(e.stack);
    emitResult({
      success: false,
      totalFiles: 0,
      processedFiles: 0,
      totalRows: 0,
      processedRows: 0,
      summaryFilePath: '',
      targetFilePath: '',
      baseTablePath: '',
      baseDir: '',
      unmatchedFiles: [],
      errors: ['处理异常: ' + e.message],
    });
  }
}

main().catch((e) => {
  console.error('[cli] 未捕获的异常: ' + e);
  emitResult({
    success: false,
    totalFiles: 0,
    processedFiles: 0,
    totalRows: 0,
    processedRows: 0,
    summaryFilePath: '',
    unmatchedFiles: [],
    errors: ['未捕获的异常: ' + (e && e.message ? e.message : String(e))],
  });
});
