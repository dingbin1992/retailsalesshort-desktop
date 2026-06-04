const { createApp, ref, reactive, watch, nextTick, onMounted, onUnmounted, computed } = Vue;

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
    const currentDay = now.getDate();

    // 默认值逻辑：每月21日及以后 → 下一个月（跨年递增年份）
    let defaultYear = currentYear;
    let defaultMonth = currentMonth;
    if (currentDay > 20) {
      if (currentMonth === 12) {
        defaultYear = currentYear + 1;
        defaultMonth = 1;
      } else {
        defaultMonth = currentMonth + 1;
      }
    }

    const years = [];
    for (let y = 2024; y <= currentYear + 1; y++) {
      years.push(y);
    }
    const months = [];
    for (let m = 1; m <= 12; m++) {
      months.push(m);
    }

    const selectedYear = ref(defaultYear);
    const selectedMonth = ref(defaultMonth);

    // 系统时间显示（每秒更新）
    const nowTime = ref(formatTime());

    function formatTime() {
      const d = new Date();
      return d.getFullYear() + '年' +
        String(d.getMonth() + 1).padStart(2, '0') + '月' +
        String(d.getDate()).padStart(2, '0') + '日 ' +
        String(d.getHours()).padStart(2, '0') + ':' +
        String(d.getMinutes()).padStart(2, '0') + ':' +
        String(d.getSeconds()).padStart(2, '0');
    }

    const timer = setInterval(function () {
      nowTime.value = formatTime();
    }, 1000);

    onUnmounted(function () {
      clearInterval(timer);
    });

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

    return { years, months, selectedYear, selectedMonth, nowTime };
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

// ---------- UserAddForm ----------
const UserAddForm = {
  template: '#user-add-form-template',
  props: {
    files: { type: Array, default: () => [] },
    initialFile: { type: String, default: '' },
    workDir: { type: String, default: '' },
  },
  emits: ['submit', 'cancel'],
  setup(props, { emit, expose }) {
    const selectedFile = ref('');
    const businessUnit = ref('');
    const excelHeaders = ref([]);
    const loadingHeaders = ref(false);

    // 独立 ref：每个标准字段一个（默认 '' 匹配 "不映射" option）
    const mapDate = ref('');
    const mapProduct = ref('');
    const mapSpec = ref('');
    const mapBatch = ref('');
    const mapUnit = ref('');
    const mapQuantity = ref('');

    const dateShort = ref(false);
    const dateLong = ref(false);

    const canSubmit = computed(function () {
      return !!businessUnit.value && !!selectedFile.value;
    });

    const readError = ref('');

    async function onFileChange() {
      mapDate.value = '';
      mapProduct.value = '';
      mapSpec.value = '';
      mapBatch.value = '';
      mapUnit.value = '';
      mapQuantity.value = '';
      dateShort.value = false;
      dateLong.value = false;
      readError.value = '';

      if (!selectedFile.value) {
        readError.value = '未指定文件';
        return;
      }
      if (!window.electronAPI) {
        readError.value = 'API 未就绪，请稍后重试';
        return;
      }

      var fullPath = props.workDir
        ? (props.workDir.replace(/[/\\]$/, '') + '\\' + selectedFile.value)
        : selectedFile.value;

      loadingHeaders.value = true;
      try {
        var hdrs = await window.electronAPI.readExcelHeaders(fullPath);
        var list = Array.isArray(hdrs) ? hdrs : [];
        excelHeaders.value = list;
        if (list.length === 0) {
          readError.value = '未读取到表头数据，请检查文件路径: ' + fullPath;
        }
      } catch (e) {
        excelHeaders.value = [];
        readError.value = '读取表头失败: ' + (e.message || e);
      } finally {
        loadingHeaders.value = false;
      }
    }

    var formData = computed(function () {
      // headers: { colNumber: "列名" }
      var hdrs = {};
      var list = excelHeaders.value || [];
      for (var i = 0; i < list.length; i++) {
        hdrs[String(i + 1)] = list[i];
      }

      // mapping: { sourceColNumber: targetColNumber }
      var srcMapping = {};
      var refs = [mapDate, mapProduct, mapSpec, mapBatch, mapUnit, mapQuantity];
      for (var di = 0; di < refs.length; di++) {
        var srcCol = refs[di].value;
        if (srcCol !== '' && srcCol !== null && srcCol !== undefined) {
          srcMapping[String(Number(srcCol))] = di + 1;
        }
      }

      return {
        businessUnit: businessUnit.value,
        headers: hdrs,
        mapping: srcMapping,
        dateFormat: {
          short: dateShort.value,
          long: dateLong.value,
        },
      };
    });

    onMounted(function () {
      var file = props.initialFile || (props.files.length > 0 ? props.files[0] : '');
      if (file) {
        selectedFile.value = file;
        onFileChange();
      }
    });

    function resetForm() {
      selectedFile.value = '';
      businessUnit.value = '';
      excelHeaders.value = [];
      mapDate.value = '';
      mapProduct.value = '';
      mapSpec.value = '';
      mapBatch.value = '';
      mapUnit.value = '';
      mapQuantity.value = '';
      dateShort.value = false;
      dateLong.value = false;
      readError.value = '';
      loadingHeaders.value = false;
    }

    expose({ resetForm, selectedFile });

    return {
      selectedFile,
      businessUnit,
      excelHeaders,
      loadingHeaders,
      mapDate,
      mapProduct,
      mapSpec,
      mapBatch,
      mapUnit,
      mapQuantity,
      dateShort,
      dateLong,
      readError,
      canSubmit,
      formData,
      onFileChange,
    };
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
    const hasUnmatched = computed(function () {
      return unmatchedFiles.value && unmatchedFiles.value.length > 0;
    });
    const logEntries = ref([]);
    const progress = reactive({ visible: false, percent: 0, text: '0%' });
    const yearMonthPickerRef = ref(null);
    const showUserAddForm = ref(false);
    const userAddFormRef = ref(null);
    const selectedUserFile = ref('');

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

    function handleUserAdd(filename) {
      console.log('[App] handleUserAdd 被调用, 文件:', filename);
      console.log('[App] unmatchedFiles.length:', unmatchedFiles.value.length);
      if (!unmatchedFiles.value.length) {
        addLog('没有未匹配的文件，无法自新增格式', 'error');
        return;
      }
      selectedUserFile.value = filename;
      showUserAddForm.value = true;
      console.log('[App] showUserAddForm 已设置为 true');
    }

    function handleCancelForm() {
      showUserAddForm.value = false;
    }

    async function handleFormSubmit(formData) {
      if (!window.electronAPI) {
        addLog('API 未就绪', 'error');
        return;
      }

      addLog('正在新增格式规则...', 'info');
      try {
        const newName = await window.electronAPI.addPattern(formData);
        addLog('已成功添加格式规则: ' + newName + ' (' + formData.businessUnit + ')', 'success');
        addLog('请重新点击"开始处理"以使用新规则', 'info');
        showUserAddForm.value = false;

        // 从未匹配列表中移除对应文件
        const userAddForm = userAddFormRef.value;
        if (userAddForm && userAddForm.selectedFile) {
          const idx = unmatchedFiles.value.indexOf(userAddForm.selectedFile);
          if (idx >= 0) {
            unmatchedFiles.value.splice(idx, 1);
          }
        }
      } catch (e) {
        const msg = typeof e === 'string' ? e : e.message || String(e);
        addLog('新增格式规则失败: ' + msg, 'error');
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
      hasUnmatched,
      logEntries,
      progress,
      yearMonthPickerRef,
      showUserAddForm,
      userAddFormRef,
      selectedUserFile,
      addLog,
      clearLog,
      updateProgress,
      hideProgress,
      handleEditConfig,
      handleUserAdd,
      handleCancelForm,
      handleFormSubmit,
      handleStartProcess,
    };
  },
});

// 注册全局组件
app.component('year-month-picker', YearMonthPicker);
app.component('directory-picker', DirectoryPicker);
app.component('action-panel', ActionPanel);
app.component('log-panel', LogPanel);
app.component('user-add-form', UserAddForm);

// 挂载
app.mount('#app');
