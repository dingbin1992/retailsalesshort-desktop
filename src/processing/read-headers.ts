/**
 * 读取 Excel 文件表头的侧车脚本
 * 用法: node read-headers.js <filePath>
 * 输出: JSON 数组 ["表头1", "表头2", ...]（stdout）
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('[read-headers] 错误: 缺少文件路径参数');
    process.exit(1);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    console.error(`[read-headers] 文件不存在: ${filePath}`);
    process.exit(1);
  }

  try {
    const wb = XLSX.readFile(filePath, { type: 'file' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];

    const ref = sheet['!ref'];
    if (!ref) {
      // 空工作表
      process.stdout.write(JSON.stringify([]) + '\n');
      return;
    }

    const range = XLSX.utils.decode_range(ref);
    const headers: string[] = [];

    // 读取表头行（第一行），过滤空值
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
      const val = cell ? cell.v : null;
      if (val !== null && val !== undefined && val !== '') {
        headers.push(String(val).trim());
      }
    }

    process.stdout.write(JSON.stringify(headers) + '\n');
  } catch (e: any) {
    console.error(`[read-headers] 读取文件失败: ${e.message}`);
    process.exit(1);
  }
}

main();
