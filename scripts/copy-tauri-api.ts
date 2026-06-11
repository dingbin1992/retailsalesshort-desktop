import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.join(__dirname, '..', 'node_modules', '@tauri-apps', 'api');
const dstDir = path.join(__dirname, '..', 'src', 'renderer', 'tauri-api');

fs.mkdirSync(dstDir, { recursive: true });

// 复制所有 JS 文件
for (const file of fs.readdirSync(srcDir)) {
  const srcPath = path.join(srcDir, file);
  if (file.endsWith('.js') && fs.statSync(srcPath).isFile()) {
    fs.copyFileSync(srcPath, path.join(dstDir, file));
  }
}

// 复制子目录
for (const subdir of ['external', 'menu']) {
  const srcSubDir = path.join(srcDir, subdir);
  const dstSubDir = path.join(dstDir, subdir);
  if (fs.existsSync(srcSubDir)) {
    fs.cpSync(srcSubDir, dstSubDir, { recursive: true });
  }
}

console.log('Tauri API files copied to src/renderer/tauri-api/');
