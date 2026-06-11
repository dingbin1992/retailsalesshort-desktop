import { invoke } from "./tauri-api/core.js";
import { listen } from "./tauri-api/event.js";
let unlistenFn = null;
window.electronAPI = {
  selectDirectory() {
    return invoke("select_directory");
  },
  startProcessing(config) {
    return invoke("start_processing", { config });
  },
  onProgress(callback) {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
    listen("processing:progress", (event) => {
      callback(event.payload);
    }).then((fn) => {
      unlistenFn = fn;
    });
  },
  removeProgressListener() {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
  },
  openDirectory(dirPath) {
    return invoke("open_directory", { dirPath });
  },
  getDefaultDirectories() {
    return invoke("get_default_directories");
  },
  openConfigFile() {
    return invoke("open_config_file");
  },
  readExcelHeaders(filePath) {
    return invoke("read_excel_headers", { filePath });
  },
  addPattern(patternData) {
    return invoke("add_pattern", { input: patternData });
  },
  getPatternsConfig() {
    return invoke("get_patterns_config");
  },
  updatePattern(name, patternData) {
    return invoke("update_pattern", { name, patternData });
  },
  deletePattern(name) {
    return invoke("delete_pattern", { name });
  },
  exportPatterns(json) {
    return invoke("export_patterns_file", { json });
  },
  importPatterns() {
    return invoke("import_patterns_file");
  }
};
console.log("[tauri-bridge] electronAPI \u6865\u63A5\u5C31\u7EEA");
