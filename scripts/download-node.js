// 下载 Windows 便携版 Node.js（node.exe）用于 Tauri 侧车打包
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const NODE_VERSION = "v24.15.0";
const DOWNLOAD_URL = `https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip`;
const DEST_DIR = path.join(__dirname, "..", "node-portable");
const ZIP_PATH = path.join(__dirname, "..", "node-portable", "node.zip");

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 302) {
          https
            .get(response.headers.location, (r) => {
              r.pipe(file);
              file.on("finish", () => {
                file.close();
                resolve();
              });
            })
            .on("error", reject);
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", reject);
  });
}

async function main() {
  // 创建目标目录
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  // 检查 node.exe 是否已存在
  const nodeExePath = path.join(DEST_DIR, "node.exe");
  if (fs.existsSync(nodeExePath)) {
    console.log("node.exe 已存在，跳过下载");
    console.log(`路径: ${nodeExePath}`);
    return;
  }

  console.log(`正在下载 Node.js ${NODE_VERSION} (Windows x64)...`);
  console.log(`下载地址: ${DOWNLOAD_URL}`);

  await download(DOWNLOAD_URL, ZIP_PATH);
  console.log("下载完成，正在解压...");

  // 使用 PowerShell 解压
  try {
    execSync(
      `powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${DEST_DIR}' -Force"`,
      { stdio: "inherit" },
    );
  } catch (e) {
    console.error("解压失败，请手动解压 node.zip");
    process.exit(1);
  }

  // 移动 node.exe 到 node-portable 根目录
  const extractedDir = path.join(DEST_DIR, `node-${NODE_VERSION}-win-x64`);
  const extractedNode = path.join(extractedDir, "node.exe");
  if (fs.existsSync(extractedNode)) {
    fs.copyFileSync(extractedNode, nodeExePath);
    // 清理临时文件
    fs.rmSync(extractedDir, { recursive: true, force: true });
    fs.unlinkSync(ZIP_PATH);
  }

  console.log(`Node.js 便携版就绪: ${nodeExePath}`);
}

main().catch((err) => {
  console.error("下载失败:", err.message);
  process.exit(1);
});
