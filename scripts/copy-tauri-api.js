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
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
const srcDir = path.join(__dirname, "..", "node_modules", "@tauri-apps", "api");
const dstDir = path.join(__dirname, "..", "src", "renderer", "tauri-api");
fs.mkdirSync(dstDir, { recursive: true });
for (const file of fs.readdirSync(srcDir)) {
  const srcPath = path.join(srcDir, file);
  if (file.endsWith(".js") && fs.statSync(srcPath).isFile()) {
    fs.copyFileSync(srcPath, path.join(dstDir, file));
  }
}
for (const subdir of ["external", "menu"]) {
  const srcSubDir = path.join(srcDir, subdir);
  const dstSubDir = path.join(dstDir, subdir);
  if (fs.existsSync(srcSubDir)) {
    fs.cpSync(srcSubDir, dstSubDir, { recursive: true });
  }
}
console.log("Tauri API files copied to src/renderer/tauri-api/");
