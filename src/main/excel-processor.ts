import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { PatternDefinition, ProgressEvent, ProcessingResult } from '../shared/types';

export class ExcelProcessor {
  private workDir: string;
  private outputDir: string;
  private patterns: PatternDefinition[];

  private summaryWb!: ExcelJS.Workbook;
  private summaryFilePath: string = '';
  private totalRows: number = 0;
  private processedRows: number = 0;
  private unmatchedFiles: string[] = [];
  private errors: string[] = [];

  // 进度回调
  private onProgress: ((event: ProgressEvent) => void) | null = null;

  constructor(workDir: string, outputDir: string, patterns: PatternDefinition[]) {
    this.workDir = workDir;
    this.outputDir = outputDir;
    this.patterns = patterns;
  }

  setProgressCallback(cb: (event: ProgressEvent) => void): void {
    this.onProgress = cb;
  }

  private emit(event: ProgressEvent): void {
    if (this.onProgress) {
      this.onProgress(event);
    }
  }

  // ========== 汇总文件创建 ==========

  async createSummaryFile(): Promise<string> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const filename = `湖北区域每日网上下载出库汇总${dateStr}.xlsx`;
    this.summaryFilePath = path.join(this.outputDir, filename);

    this.summaryWb = new ExcelJS.Workbook();
    const ws = this.summaryWb.addWorksheet('Sheet1');
    ws.columns = [
      { header: '商业单位', key: 'businessUnit' },
      { header: '日期', key: 'date' },
      { header: '品种', key: 'product' },
      { header: '规格', key: 'spec' },
      { header: '批号', key: 'batch' },
      { header: '流向单位', key: 'unit' },
      { header: '数量', key: 'quantity' },
    ];

    await this.summaryWb.xlsx.writeFile(this.summaryFilePath);
    // 重新读取以便追加
    this.summaryWb = new ExcelJS.Workbook();
    await this.summaryWb.xlsx.readFile(this.summaryFilePath);

    this.emit({ type: 'processing', message: `创建汇总文件: ${this.summaryFilePath}` });
    return this.summaryFilePath;
  }

  // ========== 格式识别 ==========

  getFilePattern(headers: Record<number, string>): PatternDefinition | null {
    for (const pattern of this.patterns) {
      const ph = pattern.headers;
      let match = true;
      for (const colStr of Object.keys(ph)) {
        const col = parseInt(colStr, 10);
        if (headers[col] !== ph[col]) {
          match = false;
          break;
        }
      }
      if (match) {
        return pattern;
      }
    }
    return null;
  }

  // ========== 统计行数 ==========

  countFileRows(sheet: XLSX.WorkSheet): number {
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    return Math.max(0, data.length - 1);
  }

  // ========== 日期标准化（严格移植 Python normalize_date） ==========

  normalizeDate(value: any, patternName: string, srcCol: number): any {
    if (value === null || value === undefined || value === '') {
      return value;
    }

    // 处理字符串中的空格
    if (typeof value === 'string') {
      if (patternName === 'pattern8' && srcCol === 2) {
        if (value.includes(' ')) {
          value = value.split(' ')[0];
        }
      } else {
        value = value.replace(/ /g, '');
      }
    }

    // 日期格式化
    if (typeof value === 'string') {
      if (value.includes('/') || value.includes('-')) {
        const dateParts = value.replace(/\//g, '-').split('-');
        if (dateParts.length === 3) {
          return `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        }
      } else if (value.trim().length === 8 && /^\d+$/.test(value.trim())) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
      }
    } else if (typeof value === 'number') {
      const valueStr = String(Math.floor(value));
      if (valueStr.length === 8) {
        return `${valueStr.slice(0, 4)}-${valueStr.slice(4, 6)}-${valueStr.slice(6, 8)}`;
      }
    }

    return value;
  }

  // ========== 处理单个工作表（严格移植 Python process_file） ==========

  processWorksheet(sheet: XLSX.WorkSheet, pattern: PatternDefinition): any[][] {
    const allData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (allData.length <= 1) {
      return [];
    }

    const mapping = pattern.mapping;
    const maxCol = Math.max(...Object.keys(mapping).map(Number));
    const result: any[][] = [];

    const batchSize = 1000;
    const dataRows = allData.slice(1); // 跳过表头行

    for (let startIdx = 0; startIdx < dataRows.length; startIdx += batchSize) {
      const batch = dataRows.slice(startIdx, startIdx + batchSize);

      for (const rowData of batch) {
        if (!Array.isArray(rowData) || rowData === null) {
          continue;
        }

        // 跳过空行
        if (rowData.every((v: any) => v === null || v === undefined || v === '')) {
          continue;
        }

        const newRow: any[] = new Array(6).fill(null);
        for (const srcColStr of Object.keys(mapping)) {
          const srcCol = parseInt(srcColStr, 10);
          const dstCol = mapping[srcCol];
          let value = srcCol - 1 < rowData.length ? rowData[srcCol - 1] : null;

          // 日期列特殊处理
          if (dstCol === 1) {
            value = this.normalizeDate(value, pattern.name, srcCol);
          } else if (typeof value === 'string') {
            // 其他列的字符串处理
            if (pattern.name === 'pattern8' && srcCol === 2) {
              if (value.includes(' ')) {
                value = value.split(' ')[0];
              }
            } else {
              value = value.replace(/ /g, '');
            }
          }

          newRow[dstCol - 1] = value;
        }

        // 数量列（第6列，unshift后为第7列）转换为数值格式
        const qty = newRow[5];
        if (qty !== null && qty !== undefined && qty !== '') {
          const num = Number(qty);
          if (!isNaN(num)) {
            newRow[5] = num;
          }
        }

        // 添加商业单位信息到第一列
        newRow.unshift(pattern.businessUnit);
        result.push(newRow);
      }
    }

    this.processedRows += result.length;
    return result;
  }

  // ========== 追加数据到汇总文件 ==========

  async appendToSummary(result: any[][]): Promise<void> {
    if (result.length === 0) {
      return;
    }

    const ws = this.summaryWb.getWorksheet(1);
    if (!ws) {
      this.emit({ type: 'error', message: '无法获取汇总工作表' });
      return;
    }
    const batchSize = 500;

    for (let i = 0; i < result.length; i += batchSize) {
      const batch = result.slice(i, i + batchSize);
      try {
        ws.addRows(batch);
      } catch {
        // 批量写入失败则逐行写入
        for (const row of batch) {
          try {
            ws.addRow(row);
          } catch {
            // 忽略单行写入失败
          }
        }
      }
    }

    await this.summaryWb.xlsx.writeFile(this.summaryFilePath);
    this.emit({ type: 'writing', message: `已追加 ${result.length} 行数据到汇总文件` });
  }

  // ========== 清理工作目录 ==========

  cleanupWorkDir(): void {
    this.emit({ type: 'cleaning', message: '正在清空工作目录中的Excel文件...' });

    const excelFiles: string[] = [];
    for (const ext of ['*.xls', '*.xlsx']) {
      const files = fs.readdirSync(this.workDir).filter(f =>
        f.toLowerCase().endsWith(ext.replace('*', ''))
      ).map(f => path.join(this.workDir, f));
      excelFiles.push(...files);
    }

    if (excelFiles.length === 0) {
      this.emit({ type: 'cleaning', message: '工作目录中没有Excel文件需要清理' });
      return;
    }

    let successCount = 0;
    for (const filePath of excelFiles) {
      try {
        fs.unlinkSync(filePath);
        successCount++;
      } catch (e: any) {
        this.errors.push(`删除失败 ${path.basename(filePath)}: ${e.message}`);
      }
    }

    this.emit({ type: 'cleaning', message: `清理完成: 成功删除 ${successCount} 个文件` });
  }

  // ========== 主处理流程（严格移植 Python run） ==========

  async run(): Promise<ProcessingResult> {
    this.totalRows = 0;
    this.processedRows = 0;
    this.unmatchedFiles = [];
    this.errors = [];

    // 1. 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 2. 获取所有Excel文件
    const excelFiles: string[] = [];
    for (const ext of ['.xls', '.xlsx']) {
      const files = fs.readdirSync(this.workDir).filter(f =>
        f.toLowerCase().endsWith(ext)
      ).map(f => path.join(this.workDir, f));
      excelFiles.push(...files);
    }

    this.emit({ type: 'scanning', message: `找到 ${excelFiles.length} 个Excel文件` });

    if (excelFiles.length === 0) {
      this.emit({ type: 'complete', message: '没有找到Excel文件' });
      return {
        success: true,
        totalFiles: 0,
        processedFiles: 0,
        totalRows: 0,
        processedRows: 0,
        summaryFilePath: '',
        unmatchedFiles: [],
        errors: [],
      };
    }

    // 3. 创建汇总文件
    await this.createSummaryFile();

    // 4. 统计总行数
    this.emit({ type: 'scanning', message: '正在统计文件行数...' });
    for (const filePath of excelFiles) {
      try {
        const wb = XLSX.readFile(filePath, { type: 'file' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = this.countFileRows(sheet);
        this.totalRows += rows;
        this.emit({ type: 'scanning', message: `文件 ${path.basename(filePath)} 包含 ${rows} 行数据` });
      } catch (e: any) {
        this.emit({ type: 'error', message: `统计文件 ${path.basename(filePath)} 行数时出错: ${e.message}` });
      }
    }

    this.emit({ type: 'scanning', message: `所有文件共包含 ${this.totalRows} 行数据` });

    // 5. 串行处理文件
    let processedFiles = 0;
    for (let i = 0; i < excelFiles.length; i++) {
      const filePath = excelFiles[i];
      try {
        this.emit({
          type: 'processing',
          currentFile: path.basename(filePath),
          fileIndex: i + 1,
          totalFiles: excelFiles.length,
          message: `正在处理: ${path.basename(filePath)} (${i + 1}/${excelFiles.length})`,
        });

        const wb = XLSX.readFile(filePath, { type: 'file' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName] as XLSX.WorkSheet;

        // 读取表头行
        const headerRow: any[] = (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][])[0] || [];
        const headers: Record<number, string> = {};
        for (let col = 1; col <= headerRow.length; col++) {
          const val = headerRow[col - 1];
          if (val !== null && val !== undefined && val !== '') {
            headers[col] = String(val).trim();
          }
        }

        // 识别文件格式
        const pattern = this.getFilePattern(headers);

        if (pattern) {
          this.emit({ type: 'processing', message: `识别为格式: ${pattern.name}` });
          const data = this.processWorksheet(sheet, pattern);
          if (data.length > 0) {
            await this.appendToSummary(data);
            this.emit({ type: 'processing', message: `成功处理 ${data.length} 行数据` });
          }
          processedFiles++;
        } else {
          const filename = path.basename(filePath);
          this.unmatchedFiles.push(filename);
          this.emit({ type: 'error', message: `未识别的文件格式，跳过文件: ${filename}` });
        }
      } catch (e: any) {
        const errMsg = `处理文件 ${path.basename(filePath)} 时出错: ${e.message}`;
        this.emit({ type: 'error', message: errMsg, error: e.stack });
        this.errors.push(errMsg);
      }
    }

    // 6. 打印汇总信息
    this.emit({
      type: 'processing',
      rowsProcessed: this.processedRows,
      totalRows: this.totalRows,
      message: `总计处理了 ${this.processedRows} 行数据`,
    });

    if (this.totalRows > 0) {
      const rate = this.totalRows > 0 ? (this.processedRows / this.totalRows * 100).toFixed(2) : '0';
      this.emit({ type: 'processing', message: `处理率: ${rate}%` });
      if (this.processedRows < this.totalRows) {
        this.emit({ type: 'error', message: `警告：有 ${this.totalRows - this.processedRows} 行数据未被处理` });
      }
    }

    // 7. 只有在全部数据处理成功时才清空工作目录
    if (this.totalRows > 0 && (this.totalRows - this.processedRows) === 0) {
      this.cleanupWorkDir();
    }

    // 8. 打开输出目录
    const { shell } = await import('electron');
    shell.openPath(this.outputDir);

    this.emit({ type: 'complete', message: '流向整理完成！' });

    return {
      success: this.errors.length === 0 && this.unmatchedFiles.length === 0,
      totalFiles: excelFiles.length,
      processedFiles,
      totalRows: this.totalRows,
      processedRows: this.processedRows,
      summaryFilePath: this.summaryFilePath,
      unmatchedFiles: this.unmatchedFiles,
      errors: this.errors,
    };
  }
}
