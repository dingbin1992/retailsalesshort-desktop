// SVG → PNG 图标生成脚本
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

const svgPath = path.join(__dirname, '..', 'assets', '数据整理.svg');
const pngPath = path.join(__dirname, '..', 'src-tauri', 'icons', 'icon.png');

async function main() {
  const svg = fs.readFileSync(svgPath);
  await sharp(svg)
    .resize(1024, 1024)
    .png()
    .toFile(pngPath);
  console.log('Generated:', pngPath);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
