// DOM 元素
const selectYear = document.getElementById('selectYear');
const selectMonth = document.getElementById('selectMonth');
const workDirInput = document.getElementById('workDir');
const outputDirInput = document.getElementById('outputDir');
const btnBrowseWork = document.getElementById('btnBrowseWork');
const btnBrowseOutput = document.getElementById('btnBrowseOutput');
const btnProcess = document.getElementById('btnProcess');
const btnEditConfig = document.getElementById('btnEditConfig');
const btnClearLog = document.getElementById('btnClearLog');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const logArea = document.getElementById('logArea');
const unmatchedSection = document.getElementById('unmatchedSection');
const unmatchedList = document.getElementById('unmatchedList');

// 状态
let isProcessing = false;

// ========== 工具函数 ==========

function timestamp() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
}

function log(message, type) {
  type = type || 'info';
  const entry = document.createElement('div');
  entry.className = 'log-entry log-' + type;
  entry.textContent = '[' + timestamp() + '] ' + message;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function setUIEnabled(enabled) {
  selectYear.disabled = !enabled;
  selectMonth.disabled = !enabled;
  btnBrowseWork.disabled = !enabled;
  btnBrowseOutput.disabled = !enabled;
  btnProcess.disabled = !enabled;
  workDirInput.disabled = !enabled;
  outputDirInput.disabled = !enabled;
  isProcessing = !enabled;
}

function updateProgress(percent, text) {
  progressContainer.style.display = 'flex';
  progressFill.style.width = percent + '%';
  progressText.textContent = text || (percent + '%');
}

function hideProgress() {
  progressContainer.style.display = 'none';
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
}

function showUnmatchedFiles(files) {
  if (!files || files.length === 0) {
    unmatchedSection.style.display = 'none';
    return;
  }
  unmatchedSection.style.display = 'block';
  unmatchedList.innerHTML = '';
  files.forEach(function (f) {
    const item = document.createElement('div');
    item.className = 'unmatched-item';
    item.textContent = f;
    unmatchedList.appendChild(item);
  });
}

// ========== 初始化 ==========

async function init() {
  // 生成年份选项（2024年 ~ 当前年+1）
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let year = 2024; year <= currentYear + 1; year++) {
    const optionEl = document.createElement('option');
    optionEl.value = year;
    optionEl.textContent = year + '年';
    selectYear.appendChild(optionEl);
  }

  // 生成月份选项（1~12月）
  for (let month = 1; month <= 12; month++) {
    const optionEl = document.createElement('option');
    optionEl.value = month;
    optionEl.textContent = month + '月';
    selectMonth.appendChild(optionEl);
  }

  // 恢复上次使用的目录
  const savedWorkDir = localStorage.getItem('workDir');
  const savedOutputDir = localStorage.getItem('outputDir');
  const savedYear = localStorage.getItem('selectYear');
  const savedMonth = localStorage.getItem('selectMonth');

  if (savedWorkDir) workDirInput.value = savedWorkDir;
  if (savedOutputDir) outputDirInput.value = savedOutputDir;
  if (savedYear) selectYear.value = savedYear;
  if (savedMonth) selectMonth.value = savedMonth;

  // 使用系统默认值填充未保存的字段（需求第5点）
  try {
    const defaults = await window.electronAPI.getDefaultDirectories();
    if (!savedWorkDir) workDirInput.value = defaults.workDir;
    if (!savedOutputDir) outputDirInput.value = defaults.outputDir;
  } catch (e) {
    // 忽略
  }

  // 如果没有保存的年月，默认选中当前年月
  if (!savedYear) {
    selectYear.value = currentYear;
  }
  if (!savedMonth) {
    selectMonth.value = now.getMonth() + 1;
  }
}

// ========== 事件处理 ==========

btnBrowseWork.addEventListener('click', async () => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    workDirInput.value = dir;
    localStorage.setItem('workDir', dir);
  }
});

btnBrowseOutput.addEventListener('click', async () => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    outputDirInput.value = dir;
    localStorage.setItem('outputDir', dir);
  }
});

selectYear.addEventListener('change', () => {
  if (selectYear.value) localStorage.setItem('selectYear', selectYear.value);
});

selectMonth.addEventListener('change', () => {
  if (selectMonth.value) localStorage.setItem('selectMonth', selectMonth.value);
});

btnClearLog.addEventListener('click', () => {
  logArea.innerHTML = '';
  log('日志已清空', 'info');
});

btnEditConfig.addEventListener('click', async () => {
  log('正在打开配置文件...', 'info');
  try {
    await window.electronAPI.openConfigFile();
  } catch (e) {
    log('打开配置文件失败: ' + e.message, 'error');
  }
});

btnProcess.addEventListener('click', async () => {
  const workDir = workDirInput.value.trim();
  const outputDir = outputDirInput.value.trim();
  const year = selectYear.value;
  const month = selectMonth.value;

  if (!year || !month) {
    log('请选择年份和月份', 'error');
    return;
  }

  const yearMonth = year + '年' + month + '月';
  if (!workDir) {
    log('请选择工作目录', 'error');
    return;
  }
  if (!outputDir) {
    log('请选择输出目录', 'error');
    return;
  }

  unmatchedSection.style.display = 'none';

  // 保存选择
  localStorage.setItem('workDir', workDir);
  localStorage.setItem('outputDir', outputDir);
  localStorage.setItem('selectYear', year);
  localStorage.setItem('selectMonth', month);

  setUIEnabled(false);
  updateProgress(0, '准备...');
  log('========== 开始处理 ==========', 'info');
  log('选择年月: ' + yearMonth, 'info');
  log('工作目录: ' + workDir, 'info');
  log('输出目录: ' + outputDir, 'info');

  window.electronAPI.onProgress((event) => {
    switch (event.type) {
      case 'scanning':
      case 'processing':
        if (event.totalRows && event.totalRows > 0 && event.rowsProcessed !== undefined) {
          const pct = Math.round((event.rowsProcessed / event.totalRows) * 100);
          updateProgress(pct);
        }
        log(event.message, 'info');
        break;
      case 'writing':
        log(event.message, 'success');
        break;
      case 'cleaning':
        log(event.message, 'info');
        break;
      case 'error':
        log(event.message, 'error');
        break;
      case 'complete':
        log(event.message, 'success');
        log('========== 处理完成 ==========', 'success');
        break;
    }
  });

  try {
    const result = await window.electronAPI.startProcessing({ workDir, outputDir, yearMonth });
    window.electronAPI.removeProgressListener();

    if (result.unmatchedFiles && result.unmatchedFiles.length > 0) {
      showUnmatchedFiles(result.unmatchedFiles);
      log('发现 ' + result.unmatchedFiles.length + ' 个未识别的文件格式，请点击"修改配置"按钮添加对应格式规则', 'error');
    }

    if (result.success) {
      log('总计: ' + result.processedFiles + '/' + result.totalFiles + ' 个文件, ' + result.processedRows + ' 行数据', 'success');
      if (result.summaryFilePath) {
        log('汇总文件: ' + result.summaryFilePath, 'success');
      }
      updateProgress(100, '完成');
      setTimeout(hideProgress, 3000);
    } else {
      if (result.unmatchedFiles && result.unmatchedFiles.length > 0) {
        log('处理完成，但有未识别的文件格式', 'error');
      }
      if (result.errors.length > 0) {
        log('处理过程中出现错误，详见上方日志', 'error');
      }
    }

    if (result.errors.length > 0) {
      log('错误详情:', 'error');
      result.errors.forEach(function(e) { log('  - ' + e, 'error'); });
    }
  } catch (err) {
    log('处理异常: ' + err.message, 'error');
    hideProgress();
  } finally {
    setUIEnabled(true);
  }
});

// 启动
init();
