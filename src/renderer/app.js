const { createApp, ref, reactive, watch, nextTick, onMounted } = Vue;

// =========================== 组件定义 ===========================

// ---------- YearMonthPicker ----------
const YearMonthPicker = {
  template: '#year-month-picker-template',
  props: {
    disabled: { type: Boolean, default: false },
  },
  setup(props, { expose }) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const years = [];
    for (let y = 2024; y <= currentYear + 1; y++) {
      years.push(y);
    }
    const months = [];
    for (let m = 1; m <= 12; m++) {
      months.push(m);
    }

    const selectedYear = ref(currentYear);
    const selectedMonth = ref(currentMonth);

    function getYear() {
      return selectedYear.value;
    }
    function getMonth() {
      return selectedMonth.value;
    }
    function getYearMonth() {
      return selectedYear.value + '年' + selectedMonth.value + '月';
    }

    expose({ getYear, getMonth, getYearMonth });

    return { years, months, selectedYear, selectedMonth };
  },
};

// ---------- DirectoryPicker ----------
const DirectoryPicker = {
  template: '#directory-picker-template',
  props: {
    label: { type: String, required: true },
    disabled: { type: Boolean, default: false },
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    async function browse() {
      if (!window.electronAPI) return;
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        emit('update:modelValue', dir);
      }
    }
    return { browse };
  },
};

// ---------- ActionPanel ----------
const ActionPanel = {
  template: '#action-panel-template',
  props: {
    isProcessing: { type: Boolean, default: false },
    progress: { type: Object, default: () => ({ visible: false, percent: 0, text: '0%' }) },
  },
  emits: ['start', 'editConfig'],
};

// ---------- UnmatchedPanel ----------
const UnmatchedPanel = {
  template: '#unmatched-panel-template',
  props: {
    files: { type: Array, default: () => [] },
    visible: { type: Boolean, default: false },
  },
};

// ---------- LogPanel ----------
const LogPanel = {
  template: '#log-panel-template',
  props: {
    entries: { type: Array, default: () => [] },
  },
  emits: ['clear'],
  setup(props) {
    const logAreaRef = ref(null);

    watch(
      () => props.entries.length,
      () => {
        nextTick(() => {
          const el = logAreaRef.value;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    );

    return { logAreaRef };
  },
};

// =========================== 应用入口 ===========================

const app = createApp({
  setup() {
    // ---- 状态 ----
    const isProcessing = ref(false);
    const workDir = ref('');
    const outputDir = ref('');
    const unmatchedFiles = ref([]);
    const logEntries = ref([]);
    const progress = reactive({ visible: false, percent: 0, text: '0%' });
    const yearMonthPickerRef = ref(null);

    // ---- 工具函数 ----

    function getTime() {
      const d = new Date();
      return (
        String(d.getHours()).padStart(2, '0') +
        ':' +
        String(d.getMinutes()).padStart(2, '0') +
        ':' +
        String(d.getSeconds()).padStart(2, '0')
      );
    }

    function addLog(message, type) {
      type = type || 'info';
      logEntries.value.push({ message, type, time: getTime() });
    }

    // 添加初始欢迎日志
    addLog('就绪，请选择年月和工作目录后点击"开始处理"。', 'info');

    function clearLog() {
      logEntries.value = [];
      addLog('日志已清空', 'info');
    }

    function updateProgress(pct, text) {
      progress.visible = true;
      progress.percent = pct;
      progress.text = text || pct + '%';
    }

    function hideProgress() {
      progress.visible = false;
      progress.percent = 0;
      progress.text = '0%';
    }

    // ---- 事件处理 ----

    async function handleEditConfig() {
      if (!window.electronAPI) return;
      addLog('正在打开配置文件...', 'info');
      try {
        await window.electronAPI.openConfigFile();
      } catch (e) {
        const msg = typeof e === 'string' ? e : e.message || String(e);
        addLog('打开配置文件失败: ' + msg, 'error');
      }
    }

    async function handleStartProcess() {
      if (!window.electronAPI) {
        addLog('API 未就绪，请稍后重试', 'error');
        return;
      }

      const ymPicker = yearMonthPickerRef.value;
      if (!ymPicker) return;

      const year = ymPicker.getYear();
      const month = ymPicker.getMonth();
      const yearMonth = ymPicker.getYearMonth();

      if (!year || !month) {
        addLog('请选择年份和月份', 'error');
        return;
      }
      if (!workDir.value) {
        addLog('请选择工作目录', 'error');
        return;
      }
      if (!outputDir.value) {
        addLog('请选择输出目录', 'error');
        return;
      }

      unmatchedFiles.value = [];
      isProcessing.value = true;
      updateProgress(0, '准备...');
      addLog('========== 开始处理 ==========', 'info');
      addLog('选择年月: ' + yearMonth, 'info');
      addLog('工作目录: ' + workDir.value, 'info');
      addLog('输出目录: ' + outputDir.value, 'info');

      window.electronAPI.onProgress(function (event) {
        switch (event.type) {
          case 'scanning':
          case 'processing':
            if (event.totalRows && event.totalRows > 0 && event.rowsProcessed !== undefined) {
              updateProgress(Math.round((event.rowsProcessed / event.totalRows) * 100));
            }
            addLog(event.message, 'info');
            break;
          case 'writing':
            addLog(event.message, 'success');
            break;
          case 'cleaning':
            addLog(event.message, 'info');
            break;
          case 'error':
            addLog(event.message, 'error');
            break;
          case 'complete':
            addLog(event.message, 'success');
            addLog('========== 处理完成 ==========', 'success');
            break;
        }
      });

      try {
        const result = await window.electronAPI.startProcessing({
          workDir: workDir.value,
          outputDir: outputDir.value,
          yearMonth: yearMonth,
        });

        window.electronAPI.removeProgressListener();

        if (result.unmatchedFiles && result.unmatchedFiles.length > 0) {
          unmatchedFiles.value = result.unmatchedFiles;
          addLog(
            '发现 ' +
              result.unmatchedFiles.length +
              ' 个未识别的文件格式，请点击"修改配置"按钮添加对应格式规则',
            'error'
          );
        }

        if (result.success) {
          addLog(
            '总计: ' +
              result.processedFiles +
              '/' +
              result.totalFiles +
              ' 个文件, ' +
              result.processedRows +
              ' 行数据',
            'success'
          );
          if (result.summaryFilePath) {
            addLog('汇总文件: ' + result.summaryFilePath, 'success');
          }
          updateProgress(100, '完成');
          setTimeout(hideProgress, 3000);
        } else {
          if (result.unmatchedFiles && result.unmatchedFiles.length > 0) {
            addLog('处理完成，但有未识别的文件格式', 'error');
          }
          if (result.errors && result.errors.length > 0) {
            addLog('处理过程中出现错误，详见上方日志', 'error');
          }
        }

        if (result.errors && result.errors.length > 0) {
          addLog('错误详情:', 'error');
          result.errors.forEach(function (e) {
            addLog('  - ' + e, 'error');
          });
        }
      } catch (err) {
        const msg = typeof err === 'string' ? err : err.message || String(err);
        addLog('处理异常: ' + msg, 'error');
        hideProgress();
      } finally {
        isProcessing.value = false;
      }
    }

    // ---- 初始化 ----
    onMounted(async function () {
      if (!window.electronAPI) {
        // tauri-bridge 模块脚本尚未执行，等待后重试
        await new Promise(function (r) {
          return setTimeout(r, 100);
        });
        if (!window.electronAPI) return;
      }
      try {
        const defaults = await window.electronAPI.getDefaultDirectories();
        workDir.value = defaults.workDir;
        outputDir.value = defaults.outputDir;
      } catch (_) {
        // 忽略初始化获取默认目录的异常
      }
    });

    return {
      isProcessing,
      workDir,
      outputDir,
      unmatchedFiles,
      logEntries,
      progress,
      yearMonthPickerRef,
      addLog,
      clearLog,
      updateProgress,
      hideProgress,
      handleEditConfig,
      handleStartProcess,
    };
  },
});

// 注册全局组件
app.component('year-month-picker', YearMonthPicker);
app.component('directory-picker', DirectoryPicker);
app.component('action-panel', ActionPanel);
app.component('unmatched-panel', UnmatchedPanel);
app.component('log-panel', LogPanel);

// 挂载
app.mount('#app');
