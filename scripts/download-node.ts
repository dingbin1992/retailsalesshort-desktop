// 下载各平台便携版 Node.js 用于 Tauri 侧车打包
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

const NODE_VERSION = 'v24.15.0';

interface PlatformInfo {
  name: string;
  ext: string;
  filename: string;
  binaryName: string;
  extractDir: string;
}

function getPlatformInfo(): PlatformInfo {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === 'win32') {
    return {
      name: 'win',
      ext: '.zip',
      filename: `node-${NODE_VERSION}-win-x64.zip`,
      binaryName: 'node.exe',
      extractDir: `node-${NODE_VERSION}-win-x64`,
    };
  }
  if (platform === 'darwin') {
    const macArch = arch === 'arm64' ? 'arm64' : 'x64';
    return {
      name: 'darwin',
      ext: '.tar.gz',
      filename: `node-${NODE_VERSION}-darwin-${macArch}.tar.gz`,
      binaryName: 'node',
      extractDir: `node-${NODE_VERSION}-darwin-${macArch}`,
    };
  }
  if (platform === 'linux') {
    return {
      name: 'linux',
      ext: '.tar.xz',
      filename: `node-${NODE_VERSION}-linux-x64.tar.xz`,
      binaryName: 'node',
      extractDir: `node-${NODE_VERSION}-linux-x64`,
    };
  }
  throw new Error(`不支持的平台: ${platform}`);
}

const DEST_DIR = path.join(__dirname, '..', 'node-portable');

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 && response.headers.location) {
          https
            .get(response.headers.location, (r) => {
              r.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            })
            .on('error', reject);
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', reject);
  });
}

async function main(): Promise<void> {
  const info = getPlatformInfo();
  const downloadUrl = `https://nodejs.org/dist/${NODE_VERSION}/${info.filename}`;

  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  const binaryPath = path.join(DEST_DIR, info.binaryName);
  if (fs.existsSync(binaryPath)) {
    console.log(`${info.binaryName} 已存在，跳过下载`);
    console.log(`路径: ${binaryPath}`);
    return;
  }

  console.log(`检测到当前平台: ${info.name} (${os.arch()})`);
  console.log(`正在下载 Node.js ${NODE_VERSION}...`);
  console.log(`下载地址: ${downloadUrl}`);

  const archivePath = path.join(DEST_DIR, `node${info.ext}`);
  await download(downloadUrl, archivePath);
  console.log('下载完成，正在解压...');

  const extractedDir = path.join(DEST_DIR, info.extractDir);
  const extractedBinary = path.join(extractedDir, 'bin', info.binaryName);

  if (info.ext === '.zip') {
    try {
      execSync(
        `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${DEST_DIR}' -Force"`,
        { stdio: 'inherit' },
      );
    } catch (_) {
      console.error('解压失败，请手动解压');
      process.exit(1);
    }
  } else if (info.ext === '.tar.gz') {
    try {
      execSync(`tar -xzf "${archivePath}" -C "${DEST_DIR}"`, { stdio: 'inherit' });
    } catch (_) {
      console.error('解压失败，请手动解压');
      process.exit(1);
    }
  } else if (info.ext === '.tar.xz') {
    try {
      execSync(`tar -xJf "${archivePath}" -C "${DEST_DIR}"`, { stdio: 'inherit' });
    } catch (_) {
      console.error('解压失败，请手动解压');
      process.exit(1);
    }
  }

  if (fs.existsSync(extractedBinary)) {
    fs.copyFileSync(extractedBinary, binaryPath);
    fs.chmodSync(binaryPath, 0o755);
  } else if (fs.existsSync(path.join(extractedDir, info.binaryName))) {
    fs.copyFileSync(path.join(extractedDir, info.binaryName), binaryPath);
  }

  fs.rmSync(extractedDir, { recursive: true, force: true });
  fs.unlinkSync(archivePath);

  console.log(`Node.js 便携版就绪: ${binaryPath}`);
}

main().catch((err: Error) => {
  console.error('下载失败:', err.message);
  process.exit(1);
});
