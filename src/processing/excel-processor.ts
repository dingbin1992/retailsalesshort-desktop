import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { PatternDefinition, ProgressEvent, ProcessingResult } from './types';

const BASE_TABLE_PATH = 'H:\\0、工作\\0、每日纯销统计\\☆☆纯销统计基表.xlsx';
const BASE_DIR = 'H:\\0、工作\\0、每日纯销统计';

export class ExcelProcessor {
  private workDir: string;
  private outputDir: string;
  private yearMonth: string;
  private patterns: PatternDefinition[];

  private summaryWb!: ExcelJS.Workbook;
  private summaryFilePath: string = '';
  private totalRows: number = 0;
  private processedRows: number = 0;
  private unmatchedFiles: string[] = [];
  private errors: string[] = [];
  private allData: any[][] = [];

  private onProgress: ((event: ProgressEvent) => void) | null = null;

  constructor(workDir: string, outputDir: string, yearMonth: string, patterns: PatternDefinition[]) {
    this.workDir = workDir;
    this.outputDir = outputDir;
    this.yearMonth = yearMonth;
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

  // ========== 路径工具 ==========

  /** 将 "2025年11月" 转为 "25年11月", "2026年3月" 转为 "26年03月" */
  buildShortYearMonth(): string {
    const match = this.yearMonth.match(/(\d{4})年(\d{1,2})月/);
    if (!match) {
      throw new Error(`无效的年月格式: ${this.yearMonth}，应为"XXXX年XX月"`);
    }
    const year = match[1].slice(2);
    const month = match[2].padStart(2, '0');
    return `${year}年${month}月`;
  }

  /** 构建目标文件路径 */
  buildTargetTablePath(): string {
    const short = this.buildShortYearMonth();
    return path.join(BASE_DIR, short, `湖北纯销每日统计${short}.xlsx`);
  }

  // ========== 前置校验 ==========

  validatePrerequisites(): void {
    // 步骤1：检查输出目录
    if (!fs.existsSync(this.outputDir)) {
      throw new Error(`输出目录不存在: ${this.outputDir}，请确认路径后重试。`);
    }

    // 步骤2：检查基表文件
    if (!fs.existsSync(BASE_TABLE_PATH)) {
      throw new Error(`基表文件不存在: ${BASE_TABLE_PATH}，请确认文件路径后重试。`);
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
    const ref = sheet['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      return Math.max(0, range.e.r - range.s.r);
    }
    return 0;
  }

  // ========== 日期标准化 ==========

  normalizeDate(value: any, patternName: string, srcCol: number): any {
    if (value === null || value === undefined || value === '') {
      return value;
    }

    if (typeof value === 'string') {
      if (patternName === 'pattern8' && srcCol === 2) {
        if (value.includes(' ')) {
          value = value.split(' ')[0];
        }
      } else {
        value = value.replace(/ /g, '');
      }
    }

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

  // ========== 处理单个工作表 ==========

  processWorksheet(sheet: XLSX.WorkSheet, pattern: PatternDefinition): any[][] {
    const ref = sheet['!ref'];
    if (!ref) return [];

    const range = XLSX.utils.decode_range(ref);
    // 无数据行（只有表头或空表）
    if (range.e.r <= range.s.r) return [];

    const mapping = pattern.mapping;
    const result: any[][] = [];
    const srcCols = Object.keys(mapping).map(Number);

    // 逐行读取，避免 sheet_to_json 创建完整副本占用额外内存
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      let hasData = false;
      const rowVals: any[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        const v = cell ? cell.v : undefined;
        rowVals.push(v !== undefined ? v : null);
        if (v !== undefined && v !== null && v !== '') hasData = true;
      }

      if (!hasData) continue;

      const newRow: any[] = new Array(6).fill(null);
      for (const srcCol of srcCols) {
        const dstCol = mapping[srcCol];
        let value = srcCol - 1 < rowVals.length ? rowVals[srcCol - 1] : null;

        if (dstCol === 1) {
          value = this.normalizeDate(value, pattern.name, srcCol);
        } else if (typeof value === 'string') {
          if (pattern.name === 'pattern8' && srcCol === 2) {
            if (value.includes(' ')) value = value.split(' ')[0];
          } else {
            value = value.replace(/ /g, '');
          }
        }

        newRow[dstCol - 1] = value;
      }

      const qty = newRow[5];
      if (qty !== null && qty !== undefined && qty !== '') {
        const num = Number(qty);
        if (!isNaN(num)) newRow[5] = num;
      }

      newRow.unshift(pattern.businessUnit);
      result.push(newRow);
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

    for (let i = 0; i < result.length; i += 500) {
      const batch = result.slice(i, i + 500);
      try {
        ws.addRows(batch);
      } catch {
        for (const row of batch) {
          try { ws.addRow(row); } catch { /* 忽略 */ }
        }
      }
    }

    this.emit({ type: 'writing', message: `已追加 ${result.length} 行数据到汇总文件` });
  }

  /** 保存汇总文件到磁盘 */
  async saveSummaryFile(): Promise<void> {
    await this.summaryWb.xlsx.writeFile(this.summaryFilePath);
  }

  // ========== 日期转Excel日期值 ==========

  private isDateString(val: any): boolean {
    return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val);
  }

  private toDateValue(val: any): Date | any {
    if (this.isDateString(val)) {
      return new Date(val);
    }
    return val;
  }

  // ========== 格式化汇总文件日期列 ==========

  private async formatSummaryDates(): Promise<void> {
    const ws = this.summaryWb.getWorksheet(1);
    if (!ws) return;

    let formattedCount = 0;
    ws.eachRow((row, rowNum) => {
      if (rowNum <= 1) return; // 跳过表头
      const cell = row.getCell(2); // B列 = 日期
      if (this.isDateString(cell.value)) {
        cell.value = new Date(cell.value as string);
        cell.numFmt = 'yyyy-mm-dd';
        formattedCount++;
      }
    });

    if (formattedCount > 0) {
      await this.summaryWb.xlsx.writeFile(this.summaryFilePath);
      this.emit({ type: 'writing', message: `已格式化 ${formattedCount} 个日期单元格` });
    }
  }

  // ========== 构建公式 ==========

  private formulaH(row: number): string {
    return `IF(ISBLANK(C${row}),0,IF(ISERROR(U${row}*G${row}/M${row}*O${row}),0,U${row}*G${row}/M${row}*O${row}))`;
  }

  private formulaI(row: number): string {
    return `IF(ISBLANK(F${row}),"",XLOOKUP(F${row},[☆☆纯销统计基表.xlsx]终端单位与区域归属!A:A,[☆☆纯销统计基表.xlsx]终端单位与区域归属!D:D,"错误"))`;
  }

  private formulaJ(row: number): string {
    return `IF(ISBLANK(F${row}),"",XLOOKUP(F${row},[☆☆纯销统计基表.xlsx]终端单位与区域归属!A:A,[☆☆纯销统计基表.xlsx]终端单位与区域归属!C:C,"错误"))`;
  }

  private formulaK(row: number): string {
    return `IF(ISBLANK(C${row}),"",XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!E:E,""))`;
  }

  private formulaL(row: number): string {
    return `IF(ISBLANK(C${row}),"",XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!F:F,""))`;
  }

  private formulaM(row: number): string {
    return `IF(ISBLANK(C${row}),0,XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!G:G,0))`;
  }

  private formulaN(row: number): string {
    return `IF(ISBLANK(C${row}),"",XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!I:I,0))`;
  }

  private formulaO(row: number): string {
    return `IF(ISBLANK(C${row}),0,XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!H:H,0))`;
  }

  private formulaP(row: number): string {
    return `IF(ISBLANK(C${row}),0,IF(ISERROR(U${row}*G${row}/M${row}),0,U${row}*G${row}/M${row}))`;
  }

  private formulaQ(row: number): string {
    return `IF(ISBLANK(C${row}),0,IF(ISERROR(U${row}*G${row}/M${row}*O${row}/10000),0,U${row}*G${row}/M${row}*O${row}/10000))`;
  }

  private formulaR(row: number): string {
    return `IF(ISBLANK(C${row}),0,XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!J:J,0))`;
  }

  private formulaS(row: number): string {
    return `IF(ISBLANK(C${row}),0,IF(ISERROR(U${row}*G${row}/M${row}),0,U${row}*G${row}/M${row}))*IF(ISBLANK(C${row}),0,XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!K:K,0))`;
  }

  private formulaT(row: number): string {
    return `IF(OR(K${row}="错误",B${row}>(TODAY()-1),J${row}="其他",AND(B${row}>DATE(2026,2,28),R${row}="川倍清")),"否",IFERROR(XLOOKUP(F${row}&R${row},[☆☆纯销统计基表.xlsx]录入明细整理!D:D&[☆☆纯销统计基表.xlsx]录入明细整理!E:E,[☆☆纯销统计基表.xlsx]录入明细整理!F:F),"是"))`;
  }

  private formulaU(row: number): string {
    return `IF(ISBLANK(C${row}),"",XLOOKUP(C${row}&D${row},[☆☆纯销统计基表.xlsx]匹配基表!A:A&[☆☆纯销统计基表.xlsx]匹配基表!B:B,[☆☆纯销统计基表.xlsx]匹配基表!L:L,""))`;
  }

  // ========== 写入目标文件 ==========

  async writeToTargetTable(): Promise<void> {
    const targetPath = this.buildTargetTablePath();
    this.emit({ type: 'processing', message: `正在写入目标文件: ${targetPath}` });

    const maxLine = this.allData.length + 1; // 数据行数 + 表头行
    if (maxLine < 2) {
      throw new Error(`数据行数不足（需要至少1行数据，当前0行），无法写入目标文件。`);
    }

    // 确保目标目录存在
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 打开或创建工作簿
    let targetWb: ExcelJS.Workbook;
    if (fs.existsSync(targetPath)) {
      targetWb = new ExcelJS.Workbook();
      await targetWb.xlsx.readFile(targetPath);
    } else {
      targetWb = new ExcelJS.Workbook();
      targetWb.addWorksheet('纯销明细');
    }

    // 获取或创建"纯销明细"工作表
    let ws = targetWb.getWorksheet('纯销明细');
    if (!ws) {
      ws = targetWb.addWorksheet('纯销明细');
    }

    // 步骤2：写入汇总数据到 A-G 列（从第2行开始，第1行为表头）
    this.emit({ type: 'writing', message: `正在粘贴 ${this.allData.length} 行数据到纯销明细...` });
    for (let i = 0; i < this.allData.length; i++) {
      const row = ws.getRow(i + 2);
      const dataRow = this.allData[i];
      for (let col = 0; col < 7 && col < dataRow.length; col++) {
        const val = dataRow[col];
        if (col === 1 && this.isDateString(val)) {
          const cell = row.getCell(col + 1);
          cell.value = new Date(val as string);
          cell.numFmt = 'yyyy-mm-dd';
        } else {
          row.getCell(col + 1).value = val;
        }
      }
      row.commit();
    }

    // 步骤3：填充公式 H-U 列（j = 2 到 maxLine）
    this.emit({ type: 'writing', message: `正在填充公式 H-U 列，共 ${this.allData.length} 行...` });

    const formulaBuilders = [
      this.formulaH.bind(this),
      this.formulaI.bind(this),
      this.formulaJ.bind(this),
      this.formulaK.bind(this),
      this.formulaL.bind(this),
      this.formulaM.bind(this),
      this.formulaN.bind(this),
      this.formulaO.bind(this),
      this.formulaP.bind(this),
      this.formulaQ.bind(this),
      this.formulaR.bind(this),
      this.formulaS.bind(this),
      this.formulaT.bind(this),
      this.formulaU.bind(this),
    ];

    // 列号：H=8 到 U=21
    for (let rowNum = 2; rowNum <= maxLine; rowNum++) {
      const row = ws.getRow(rowNum);
      for (let fi = 0; fi < formulaBuilders.length; fi++) {
        const colNum = 8 + fi; // H=8, I=9, ..., U=21
        row.getCell(colNum).value = { formula: formulaBuilders[fi](rowNum) };
      }
      row.commit();
    }

    await targetWb.xlsx.writeFile(targetPath);
    this.emit({ type: 'writing', message: `目标文件写入完成: ${targetPath}` });
  }

  // ========== 清理工作目录 ==========

  async cleanupWorkDir(): Promise<void> {
    const excelFiles: string[] = [];
    if (fs.existsSync(this.workDir)) {
      for (const ext of ['.xls', '.xlsx']) {
        const files = fs.readdirSync(this.workDir).filter(f =>
          f.toLowerCase().endsWith(ext)
        ).map(f => path.join(this.workDir, f));
        excelFiles.push(...files);
      }
    }

    if (excelFiles.length === 0) {
      this.emit({ type: 'cleaning', message: '工作目录中没有需要清理的Excel文件' });
      return;
    }

    this.emit({ type: 'cleaning', message: `正在清理工作目录，共 ${excelFiles.length} 个文件...` });

    for (const filePath of excelFiles) {
      try {
        fs.unlinkSync(filePath);
        this.emit({ type: 'cleaning', message: `已删除: ${path.basename(filePath)}` });
      } catch (e: any) {
        this.emit({ type: 'error', message: `删除文件失败: ${path.basename(filePath)} - ${e.message}` });
      }
    }

    this.emit({ type: 'cleaning', message: '工作目录清理完成' });
  }

  // ========== 主处理流程 ==========

  async run(): Promise<ProcessingResult> {
    this.totalRows = 0;
    this.processedRows = 0;
    this.unmatchedFiles = [];
    this.errors = [];
    this.allData = [];

    // 步骤1+2：前置校验
    this.emit({ type: 'scanning', message: '正在验证前置条件...' });
    try {
      this.validatePrerequisites();
      this.emit({ type: 'scanning', message: `输出目录验证通过: ${this.outputDir}` });
      this.emit({ type: 'scanning', message: `基表文件验证通过: ${BASE_TABLE_PATH}` });
    } catch (e: any) {
      this.emit({ type: 'error', message: e.message });
      return {
        success: false,
        totalFiles: 0,
        processedFiles: 0,
        totalRows: 0,
        processedRows: 0,
        summaryFilePath: '',
        targetFilePath: '',
        baseTablePath: BASE_TABLE_PATH,
        baseDir: BASE_DIR,
        unmatchedFiles: [],
        errors: [e.message],
      };
    }

    // 步骤5：获取所有Excel文件
    const excelFiles: string[] = [];
    if (fs.existsSync(this.workDir)) {
      for (const ext of ['.xls', '.xlsx']) {
        const files = fs.readdirSync(this.workDir).filter(f =>
          f.toLowerCase().endsWith(ext)
        ).map(f => path.join(this.workDir, f));
        excelFiles.push(...files);
      }
    }

    this.emit({ type: 'scanning', message: `找到 ${excelFiles.length} 个Excel文件` });

    if (excelFiles.length === 0) {
      this.emit({ type: 'complete', message: '没有找到Excel文件，仅执行目标文件更新' });
      // 即使没有文件，也尝试处理已有数据
      if (this.allData.length > 0) {
        await this.writeToTargetTable();
      }
      let targetPath = '';
      if (this.allData.length > 0) {
        targetPath = this.buildTargetTablePath();
      }
      return {
        success: true,
        totalFiles: 0,
        processedFiles: 0,
        totalRows: 0,
        processedRows: 0,
        summaryFilePath: '',
        targetFilePath: targetPath,
        baseDir: BASE_DIR,
        unmatchedFiles: [],
        errors: [],
      };
    }

    // 统计总行数（使用sheet范围，避免加载全部数据）
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

    // 预先创建汇总文件，处理过程中增量写入
    await this.createSummaryFile();

    // 串行处理文件，收集所有数据
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

        // 仅读取表头行，避免加载全部数据
        const sheetRef = sheet['!ref'];
        let headerRow: any[] = [];
        if (sheetRef) {
          const hdrRange = XLSX.utils.decode_range(sheetRef);
          for (let c = hdrRange.s.c; c <= hdrRange.e.c; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: hdrRange.s.r, c })];
            headerRow.push(cell ? cell.v : null);
          }
        }
        const headers: Record<number, string> = {};
        for (let col = 1; col <= headerRow.length; col++) {
          const val = headerRow[col - 1];
          if (val !== null && val !== undefined && val !== '') {
            headers[col] = String(val).trim();
          }
        }

        const pattern = this.getFilePattern(headers);

        if (pattern) {
          this.emit({ type: 'processing', message: `识别为格式: ${pattern.name}` });
          const data = this.processWorksheet(sheet, pattern);
          if (data.length > 0) {
            this.allData.push(...data);
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

    // 汇总信息
    this.emit({
      type: 'processing',
      rowsProcessed: this.processedRows,
      totalRows: this.totalRows,
      message: `总计处理了 ${this.processedRows} 行数据`,
    });

    if (this.totalRows > 0) {
      const rate = (this.processedRows / this.totalRows * 100).toFixed(2);
      this.emit({ type: 'processing', message: `处理率: ${rate}%` });
    }

    // 仅全部处理成功时保存汇总文件并格式化日期
    const allSuccess = this.errors.length === 0 && this.unmatchedFiles.length === 0;

    if (allSuccess) {
      if (this.allData.length > 0) {
        await this.saveSummaryFile();
        await this.formatSummaryDates();
      }
      // 步骤6.2+6.3：写入目标文件（汇总数据 + 公式）
      if (this.allData.length > 0) {
        try {
          await this.writeToTargetTable();
        } catch (e: any) {
          this.errors.push(`写入目标文件失败: ${e.message}`);
          this.emit({ type: 'error', message: `写入目标文件失败: ${e.message}` });
        }
      }
      // 成功时清理工作目录
      await this.cleanupWorkDir();
    } else {
      // 处理失败，删除汇总文件
      if (this.summaryFilePath) {
        try {
          fs.unlinkSync(this.summaryFilePath);
          this.emit({ type: 'cleaning', message: `处理未完全成功，已删除汇总文件: ${path.basename(this.summaryFilePath)}` });
        } catch (_) { /* 忽略删除失败 */ }
        this.summaryFilePath = '';
      }
      const reasons: string[] = [];
      if (this.errors.length > 0) reasons.push(`${this.errors.length} 个错误`);
      if (this.unmatchedFiles.length > 0) reasons.push(`${this.unmatchedFiles.length} 个文件未匹配到格式`);
      this.emit({ type: 'cleaning', message: `处理未完全成功（${reasons.join('，')}），跳过清理工作目录，保留原始文件以便排查` });
    }

    this.emit({ type: 'complete', message: '流向整理完成！' });

    const finalTargetPath = this.allData.length > 0 ? this.buildTargetTablePath() : '';

    return {
      success: this.errors.length === 0 && this.unmatchedFiles.length === 0,
      totalFiles: excelFiles.length,
      processedFiles,
      totalRows: this.totalRows,
      processedRows: this.processedRows,
      summaryFilePath: this.summaryFilePath,
      targetFilePath: finalTargetPath,
      baseTablePath: BASE_TABLE_PATH,
      baseDir: BASE_DIR,
      unmatchedFiles: this.unmatchedFiles,
      errors: this.errors,
    };
  }
}
