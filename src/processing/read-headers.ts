/**
 * 读取 Excel 文件表头的侧车脚本
 * 用法: node read-headers.js <filePath>
 * 输出: JSON 数组 ["表头1", "表头2", ...]（stdout）
 *
 * 兼容性：
 * - 真 xlsx/xls（OOXML / BIFF）由 SheetJS 解析
 * - "假 xls"（HTML 表格，charset 可能是 GB2312/UTF-8/GBK）由内置 HTML 解析器处理
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';

/** 从字节流中嗅探是否是 HTML 文档 */
function looksLikeHtml(buf: Buffer): boolean {
  // 跳过 UTF-8 BOM
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3;
  const head = buf.slice(start, Math.min(buf.length, 2048)).toString('ascii').toLowerCase().trimStart();
  return head.startsWith('<!doctype html') ||
         head.startsWith('<html') ||
         head.startsWith('<head') ||
         head.startsWith('<meta') ||
         head.startsWith('<body') ||
         head.startsWith('<table');
}

/** 检测 HTML 头部声明的 charset（默认 GB2312，因为"假 xls"多为 GB 系） */
function detectHtmlCharset(raw: string): string {
  const m = raw.match(/<meta[^>]+charset=["']?([\w-]+)/i);
  if (m) return m[1].toLowerCase();
  return 'gb2312';
}

/**
 * 把任意编码的 HTML 字节流解析为 UTF-8 字符串
 * 支持 GBK / GB2312 / GB18030 / UTF-8 等
 */
function decodeHtmlBuffer(buf: Buffer): string {
  // 优先尝试 UTF-8（含 BOM）
  const head = buf.slice(0, Math.min(buf.length, 4096));
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    return buf.slice(3).toString('utf-8');
  }
  // 尝试用 charset 声明解码
  const asciiHead = head.toString('ascii');
  const charset = detectHtmlCharset(asciiHead);
  if (charset && /^(utf-?8|gbk|gb2312|gb18030|big5|shift_jis|euc-?jp|ks_c_5601)/i.test(charset)) {
    try {
      return iconv.decode(buf, charset);
    } catch (_) {
      // 退化到 GBK
    }
  }
  try { return iconv.decode(buf, 'gbk'); } catch (_) { /* ignore */ }
  return buf.toString('utf-8');
}

/** 解码 HTML 实体（&nbsp; &amp; 等） */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);?/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * 提取 HTML 表格的第一行所有 <th>/<td> 文本作为表头
 * 容错处理：
 *   - 属性中可能带 vnd.ms-excel.numberformat 等
 *   - 标签可能大写/小写混合
 *   - 表格可能无 <thead>，直接 <tr> 在 <table> 下
 */
function parseHtmlTableFirstRow(html: string): string[] {
  // 先找第一个 <table>
  const tableMatch = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return [];
  const tableBody = tableMatch[1];

  // 找第一个 <tr>
  const trMatch = tableBody.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i);
  if (!trMatch) return [];
  const trBody = trMatch[1];

  // 提取 <th> / <td> 文本
  const cellRe = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const headers: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(trBody)) !== null) {
    // 去掉内部嵌套标签，只保留文本
    const innerHtml = m[2].replace(/<[^>]+>/g, '');
    const text = decodeEntities(innerHtml).replace(/\s+/g, ' ').trim();
    if (text) headers.push(text);
  }
  return headers;
}

/** 主入口：先嗅探文件类型，按类型分发 */
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
    const buf = fs.readFileSync(filePath);

    // 分支 1：HTML 假冒 xls
    if (looksLikeHtml(buf)) {
      const html = decodeHtmlBuffer(buf);
      const headers = parseHtmlTableFirstRow(html);
      process.stdout.write(JSON.stringify(headers) + '\n');
      return;
    }

    // 分支 2：真 xlsx / xls
    const wb = XLSX.readFile(filePath, { type: 'file' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];

    const ref = sheet['!ref'];
    if (!ref) {
      process.stdout.write(JSON.stringify([]) + '\n');
      return;
    }

    const range = XLSX.utils.decode_range(ref);
    const headers: string[] = [];
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
