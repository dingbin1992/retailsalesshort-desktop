"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var https = __toESM(require("https"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_child_process = require("child_process");
var os = __toESM(require("os"));
const NODE_VERSION = "v24.15.0";
function getPlatformInfo() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "win32") {
    return {
      name: "win",
      ext: ".zip",
      filename: `node-${NODE_VERSION}-win-x64.zip`,
      binaryName: "node.exe",
      extractDir: `node-${NODE_VERSION}-win-x64`
    };
  }
  if (platform === "darwin") {
    const macArch = arch === "arm64" ? "arm64" : "x64";
    return {
      name: "darwin",
      ext: ".tar.gz",
      filename: `node-${NODE_VERSION}-darwin-${macArch}.tar.gz`,
      binaryName: "node",
      extractDir: `node-${NODE_VERSION}-darwin-${macArch}`
    };
  }
  if (platform === "linux") {
    return {
      name: "linux",
      ext: ".tar.xz",
      filename: `node-${NODE_VERSION}-linux-x64.tar.xz`,
      binaryName: "node",
      extractDir: `node-${NODE_VERSION}-linux-x64`
    };
  }
  throw new Error(`\u4E0D\u652F\u6301\u7684\u5E73\u53F0: ${platform}`);
}
const DEST_DIR = path.join(__dirname, "..", "node-portable");
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 && response.headers.location) {
        https.get(response.headers.location, (r) => {
          r.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        }).on("error", reject);
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", reject);
  });
}
async function main() {
  const info = getPlatformInfo();
  const downloadUrl = `https://nodejs.org/dist/${NODE_VERSION}/${info.filename}`;
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }
  const binaryPath = path.join(DEST_DIR, info.binaryName);
  if (fs.existsSync(binaryPath)) {
    console.log(`${info.binaryName} \u5DF2\u5B58\u5728\uFF0C\u8DF3\u8FC7\u4E0B\u8F7D`);
    console.log(`\u8DEF\u5F84: ${binaryPath}`);
    return;
  }
  console.log(`\u68C0\u6D4B\u5230\u5F53\u524D\u5E73\u53F0: ${info.name} (${os.arch()})`);
  console.log(`\u6B63\u5728\u4E0B\u8F7D Node.js ${NODE_VERSION}...`);
  console.log(`\u4E0B\u8F7D\u5730\u5740: ${downloadUrl}`);
  const archivePath = path.join(DEST_DIR, `node${info.ext}`);
  await download(downloadUrl, archivePath);
  console.log("\u4E0B\u8F7D\u5B8C\u6210\uFF0C\u6B63\u5728\u89E3\u538B...");
  const extractedDir = path.join(DEST_DIR, info.extractDir);
  const extractedBinary = path.join(extractedDir, "bin", info.binaryName);
  if (info.ext === ".zip") {
    try {
      (0, import_child_process.execSync)(
        `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${DEST_DIR}' -Force"`,
        { stdio: "inherit" }
      );
    } catch (_) {
      console.error("\u89E3\u538B\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u89E3\u538B");
      process.exit(1);
    }
  } else if (info.ext === ".tar.gz") {
    try {
      (0, import_child_process.execSync)(`tar -xzf "${archivePath}" -C "${DEST_DIR}"`, { stdio: "inherit" });
    } catch (_) {
      console.error("\u89E3\u538B\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u89E3\u538B");
      process.exit(1);
    }
  } else if (info.ext === ".tar.xz") {
    try {
      (0, import_child_process.execSync)(`tar -xJf "${archivePath}" -C "${DEST_DIR}"`, { stdio: "inherit" });
    } catch (_) {
      console.error("\u89E3\u538B\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u89E3\u538B");
      process.exit(1);
    }
  }
  if (fs.existsSync(extractedBinary)) {
    fs.copyFileSync(extractedBinary, binaryPath);
    fs.chmodSync(binaryPath, 493);
  } else if (fs.existsSync(path.join(extractedDir, info.binaryName))) {
    fs.copyFileSync(path.join(extractedDir, info.binaryName), binaryPath);
  }
  fs.rmSync(extractedDir, { recursive: true, force: true });
  fs.unlinkSync(archivePath);
  console.log(`Node.js \u4FBF\u643A\u7248\u5C31\u7EEA: ${binaryPath}`);
}
main().catch((err) => {
  console.error("\u4E0B\u8F7D\u5931\u8D25:", err.message);
  process.exit(1);
});
